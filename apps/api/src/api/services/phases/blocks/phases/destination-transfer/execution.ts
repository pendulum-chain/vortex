import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getOnChainTokenDetails,
  multiplyByPowerOfTen,
  RampPhase
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, keccak256, parseTransaction } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError, UnrecoverablePhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import {
  FinancialOperationReconciliationRequiredError,
  FinancialOperationRejectedError,
  requireFinancialFlowIdentity,
  runFinancialOperation
} from "../../core/financial-operation";

const BALANCE_POLLING_TIME_MS = 5000;
const EVM_BALANCE_CHECK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

function validateDestinationTransferRecipient(rawTx: `0x${string}`, expectedDestination: string): void {
  const decoded = parseTransaction(rawTx);

  if (!decoded.to) {
    throw new Error("DestinationTransferExecutor: Presigned transaction has no 'to' address");
  }

  const isNativeTransfer = !decoded.data || decoded.data === "0x";

  if (isNativeTransfer) {
    if (decoded.to.toLowerCase() !== expectedDestination.toLowerCase()) {
      throw new Error(
        "DestinationTransferExecutor: Native transfer recipient mismatch. " +
          `Expected ${expectedDestination}, got ${decoded.to}`
      );
    }
    return;
  }

  // ERC-20 transfer: `to` is the token contract, recipient is in calldata
  if (!decoded.data) {
    throw new Error("DestinationTransferExecutor: ERC-20 transfer missing calldata");
  }
  const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: decoded.data });
  if (functionName !== "transfer") {
    throw new Error(`DestinationTransferExecutor: Expected ERC-20 'transfer' call, got '${functionName}'`);
  }

  const [recipient] = args as [string, bigint];
  if (recipient.toLowerCase() !== expectedDestination.toLowerCase()) {
    throw new Error(
      "DestinationTransferExecutor: ERC-20 transfer recipient mismatch. " + `Expected ${expectedDestination}, got ${recipient}`
    );
  }
}

export class DestinationTransferExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "destinationTransfer";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const evmClientManager = EvmClientManager.getInstance();

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const outTokenDetails = getOnChainTokenDetails(quote.network, quote.outputCurrency) as EvmTokenDetails;
    if (!outTokenDetails) {
      throw new Error(
        `DestinationTransferExecutor: Unsupported output token ${quote.outputCurrency} for network ${quote.network}`
      );
    }

    const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
    const expectedAmountRaw = multiplyByPowerOfTen(quote.outputAmount, outTokenDetails.decimals).toString();
    const destinationNetwork = quote.network as EvmNetworks;
    const { destinationTransferTxHash, destinationAddress } = state.state as StateMetadata;

    if (destinationAddress) {
      validateDestinationTransferRecipient(destinationTransfer as `0x${string}`, destinationAddress);
    } else {
      logger.warn("DestinationTransferExecutor: No destinationAddress in state metadata, skipping recipient validation");
    }
    if (destinationTransferTxHash) {
      try {
        const client = evmClientManager.getClient(destinationNetwork);
        const receipt = await abortableCall(signal, () =>
          client.getTransactionReceipt({ hash: destinationTransferTxHash as `0x${string}` })
        );

        if (receipt.status === "success") {
          return state;
        } else {
          throw new Error(`Transaction ${destinationTransferTxHash} failed on chain.`);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== "TransactionReceiptNotFoundError") {
          throw error;
        }
        // If receipt not found, proceed to normal flow
      }
    }

    // Nonce-gap guard: a presigned nonce ahead of the live ephemeral nonce can never be mined and
    // would silently retry until the processor gives up, stranding user funds. Both parsing and
    // the live RPC preflight fail closed; only the latter is recoverable.
    if (!destinationTransferTxHash && state.state.evmEphemeralAddress) {
      let presignedNonce: number;
      try {
        const parsedNonce = parseTransaction(destinationTransfer as `0x${string}`).nonce;
        if (parsedNonce === undefined) {
          throw new Error("transaction has no nonce");
        }
        presignedNonce = parsedNonce;
      } catch (error) {
        throw this.createUnrecoverableError(
          `DestinationTransferExecutor: server-generated presigned destination transfer could not be validated: ${(error as Error).message}`
        );
      }

      let liveNonce: number;
      try {
        liveNonce = await abortableCall(signal, () =>
          evmClientManager.getClient(destinationNetwork).getTransactionCount({
            address: state.state.evmEphemeralAddress as `0x${string}`,
            blockTag: "pending"
          })
        );
      } catch (error) {
        throw this.createRecoverableError(
          `DestinationTransferExecutor: destination nonce preflight is unavailable: ${(error as Error).message}`
        );
      }

      if (presignedNonce > liveNonce) {
        throw this.createUnrecoverableError(
          `DestinationTransferExecutor: presigned nonce ${presignedNonce} is ahead of the ephemeral live nonce ${liveNonce}. ` +
            "The transfer can never broadcast (nonce gap); manual review required."
        );
      }
    }

    try {
      await checkEvmBalanceForToken({
        amountDesiredRaw: expectedAmountRaw,
        chain: destinationNetwork,
        intervalMs: BALANCE_POLLING_TIME_MS,
        ownerAddress: state.state.evmEphemeralAddress,
        signal,
        timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
        tokenDetails: outTokenDetails
      });

      const signedTransaction = destinationTransfer as `0x${string}`;
      const deterministicHash = keccak256(signedTransaction);
      const destinationClient = evmClientManager.getClient(destinationNetwork);
      const { hash: txHash } = await runFinancialOperation({
        attemptClass: "destination-presigned-broadcast",
        externalId: result => result.hash,
        flow: requireFinancialFlowIdentity(state.state),
        perform: async () => {
          throwIfAborted(signal);
          const hash = await abortableCall(signal, () =>
            evmClientManager.sendRawTransactionWithRetry(destinationNetwork, signedTransaction)
          );
          return { hash };
        },
        phase: this.getPhaseName(),
        provider: destinationNetwork,
        reconcile: async () => {
          try {
            const receipt = await abortableCall(signal, () =>
              destinationClient.getTransactionReceipt({ hash: deterministicHash })
            );
            if (receipt.status !== "success") {
              throw new FinancialOperationRejectedError(`Destination transfer ${deterministicHash} failed`);
            }
            await abortableCall(signal, () => destinationClient.getTransaction({ hash: deterministicHash }));
            return { hash: deterministicHash };
          } catch (error) {
            throwIfAborted(signal);
            if (error instanceof FinancialOperationRejectedError) throw error;
            return null;
          }
        },
        request: { network: destinationNetwork, signedTransaction },
        scopeId: state.id,
        scopeType: "ramp",
        signal
      });
      await state.update({
        state: {
          ...state.state,
          destinationTransferTxHash: txHash
        }
      });

      return state;
    } catch (error) {
      if (error instanceof PhaseError) throw error;
      if (error instanceof FinancialOperationReconciliationRequiredError) {
        throw this.createReconciliationRequiredError(error.message);
      }
      throw this.createRecoverableError(
        `DestinationTransferExecutor: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}
