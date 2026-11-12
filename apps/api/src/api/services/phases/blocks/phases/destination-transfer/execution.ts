import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmTokenDetails,
  getOnChainTokenDetails,
  OnChainToken,
  RampPhase
} from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, keccak256, parseTransaction } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { APIError } from "../../../../../errors/api-error";
import { PhaseError, UnrecoverablePhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata } from "../../core/metadata";
import { DestinationTransferContext } from "./simulation";

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

    const delivery = getBlockMetadata(quote.metadata, DestinationTransferContext);
    const destinationNetwork = delivery.network as EvmNetworks;
    const outTokenDetails = getOnChainTokenDetails(destinationNetwork, delivery.token as OnChainToken) as EvmTokenDetails;
    if (!outTokenDetails) {
      throw new Error(
        `DestinationTransferExecutor: Unsupported output token ${delivery.token} for network ${destinationNetwork}`
      );
    }

    const { txData: destinationTransfer } = this.getPresignedTransaction(state, "destinationTransfer");
    // The precondition must demand the exact raw integer the presigned transfer spends (and the
    // preceding subsidy funded); reconstructing it from the decimal quote.outputAmount can round
    // one raw unit above the funded amount and wedge the ramp.
    const expectedAmountRaw = delivery.amountRaw;
    const { destinationTransferTxHash, destinationAddress } = state.state as StateMetadata;

    if (destinationAddress) {
      validateDestinationTransferRecipient(destinationTransfer as `0x${string}`, destinationAddress);
    } else {
      logger.warn("DestinationTransferExecutor: No destinationAddress in state metadata, skipping recipient validation");
    }
    if (destinationTransferTxHash) {
      let receipt: { status: string } | undefined;
      try {
        const client = evmClientManager.getClient(destinationNetwork);
        receipt = await abortableCall(signal, () =>
          client.getTransactionReceipt({ hash: destinationTransferTxHash as `0x${string}` })
        );
      } catch (error) {
        throwIfAborted(signal);
        // A delivery that is not mined yet proceeds to the normal flow; any other read error is retried.
        if (!(error instanceof Error && error.name === "TransactionReceiptNotFoundError")) {
          throw this.createRecoverableError(
            `DestinationTransferExecutor: could not read the delivery receipt - ${(error as Error).message}`
          );
        }
      }
      if (receipt?.status === "success") {
        return state;
      }
      if (receipt) {
        throw this.createReconciliationRequiredError(
          `DestinationTransferExecutor: delivery requires manual reconciliation - transaction ${destinationTransferTxHash} failed on chain.`
        );
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
        // Pause rather than fail: a lagging RPC can report a stale nonce, and the recovery worker
        // re-reads it, while a real gap stays parked with the funds on the ephemeral for review.
        throw this.createReconciliationRequiredError(
          `DestinationTransferExecutor: presigned nonce ${presignedNonce} is ahead of the ephemeral live nonce ${liveNonce}. ` +
            "The transfer can never broadcast (nonce gap); manual review required."
        );
      }
    }

    try {
      const signedTransaction = destinationTransfer as `0x${string}`;
      const deterministicHash = keccak256(signedTransaction);
      const destinationClient = evmClientManager.getClient(destinationNetwork);
      const { hash: txHash } = await this.runFinancialOperation(state, {
        attemptClass: "destination-presigned-broadcast",
        // Checked only before a first broadcast: once one was attempted, the delivery may already
        // have emptied the ephemeral, and the journal settles it from the transfer's receipt instead.
        beforePerform: async () => {
          await checkEvmBalanceForToken({
            amountDesiredRaw: expectedAmountRaw,
            chain: destinationNetwork,
            intervalMs: BALANCE_POLLING_TIME_MS,
            ownerAddress: state.state.evmEphemeralAddress,
            signal,
            timeoutMs: EVM_BALANCE_CHECK_TIMEOUT_MS,
            tokenDetails: outTokenDetails
          });
        },
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await abortableCall(signal, () =>
            evmClientManager.sendRawTransactionWithRetry(destinationNetwork, signedTransaction)
          );
          // The ramp completes only on a successful delivery receipt. A reverted transfer spends the
          // presigned nonce and leaves the funds on the ephemeral, so the phase must not advance.
          const receipt = await abortableCall(signal, () =>
            destinationClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
          );
          if (receipt.status !== "success") {
            throw new FinancialOperationRejectedError(`Destination transfer ${hash} failed`);
          }
          return { hash };
        },
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
      // A reverted or definitively failed delivery cannot be retried with the spent presigned
      // transaction; hold the ramp in this phase for manual reconciliation.
      if (error instanceof APIError) {
        throw this.createReconciliationRequiredError(
          `DestinationTransferExecutor: delivery requires manual reconciliation - ${error.message}`
        );
      }
      throw this.createRecoverableError(
        `DestinationTransferExecutor: Error during phase execution - ${(error as Error).message}`
      );
    }
  }
}
