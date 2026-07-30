import {
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayOfframpStatus,
  AlfredpayPaymentMethodType,
  EvmClientManager,
  EvmNetworks,
  getNetworkFromDestination,
  isNetworkEVM,
  isSignedTypedDataArray,
  Networks,
  RampPhase,
  SignedTypedData,
  sleep
} from "@vortexfi/shared";
import { erc20Abi, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import { tokenRelayerAbi } from "../../../../../../contracts/TokenRelayer";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError } from "../../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { verifyUserSubmittedTxByHash } from "../../../../phases/helpers/user-tx-verifier";
import { StateMetadata } from "../../../../phases/meta-state-types";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { ensurePresignedTransferFunded } from "../../core/destination-funding";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getAnchorPayoutMaxRetries, isAnchorMockingEnabled } from "../anchor-test-mode";
import { FinalSettlementSubsidyExecutor } from "../final-settlement-subsidy/execution";
import { FundEphemeralExecutor } from "../fund-ephemeral/execution";
import { getAlfredpayRelayerAddress } from "./permit";

type VrsSignature = { v: number; r: `0x${string}`; s: `0x${string}` };

const permitAbi = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const transferFromAbi = [
  {
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" }
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

function extractPermitFields(permitTypedData: SignedTypedData) {
  const permitMessage = permitTypedData.message;
  return {
    deadline: BigInt(permitMessage.deadline as string),
    owner: permitMessage.owner as `0x${string}`,
    spender: permitMessage.spender as `0x${string}`,
    token: permitTypedData.domain.verifyingContract as `0x${string}`,
    value: BigInt(permitMessage.value as string)
  };
}

export class AlfredpayOfframpPermitExecutor extends BasePhaseHandler {
  private evmClientManager: EvmClientManager;

  constructor() {
    super();
    this.evmClientManager = EvmClientManager.getInstance();
  }

  public getPhaseName(): RampPhase {
    return "squidRouterPermitExecute";
  }

  public getMaxRetries(): number {
    return 20;
  }

  private async assertOwnerHasBalance(
    fromNetwork: EvmNetworks,
    token: `0x${string}`,
    owner: `0x${string}`,
    value: bigint,
    signal?: AbortSignal
  ): Promise<void> {
    const publicClient = this.evmClientManager.getClient(fromNetwork);
    const balance = await abortableCall(signal, () =>
      publicClient.readContract({
        abi: erc20Abi,
        address: token,
        args: [owner],
        functionName: "balanceOf"
      })
    );

    if (balance < value) {
      throw this.createRecoverableError(
        `Owner ${owner} has insufficient ${token} balance for permit execution: has ${balance}, needs ${value}. ` +
          "Waiting for funds before sending the single-use permit."
      );
    }

    logger.info(`Owner ${owner} balance ${balance} covers required ${value} for permit execution`);
  }

  private getExecutorClients(fromNetwork: EvmNetworks) {
    const executorAccount = privateKeyToAccount(config.secrets.moonbeamExecutorPrivateKey as `0x${string}`);
    return {
      publicClient: this.evmClientManager.getClient(fromNetwork),
      walletClient: this.evmClientManager.getWalletClient(fromNetwork, executorAccount)
    };
  }

  private extractSignature(typedData: SignedTypedData, label: string): VrsSignature {
    const sig = typedData.signature as VrsSignature | undefined;
    if (!sig) throw this.createUnrecoverableError(`${label} signature not found`);
    return sig;
  }

  private async saveHashAndAwaitReceipt(
    state: RampState,
    hash: `0x${string}`,
    fromNetwork: EvmNetworks,
    label: string,
    signal?: AbortSignal
  ): Promise<RampState> {
    logger.info(`${label} tx sent: ${hash}`);
    const updatedState = await state.update({
      state: { ...state.state, squidRouterPermitExecutionHash: hash }
    });
    const { publicClient } = this.getExecutorClients(fromNetwork);
    const receipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash }));
    if (!receipt || receipt.status !== "success") throw this.createRecoverableError(`${label} tx failed: ${hash}`);
    logger.info(`${label} tx confirmed: ${hash}`);
    return updatedState;
  }

  private async waitForUserHash(
    state: RampState,
    hash: `0x${string}` | undefined,
    fromNetwork: EvmNetworks,
    label: string,
    presignedPhase: RampPhase,
    signal?: AbortSignal
  ): Promise<void> {
    await verifyUserSubmittedTxByHash({ fromNetwork, hash, label, presignedPhase, signal, state });
    logger.info(`${label} tx confirmed: ${hash}`);
  }

  private async executeNoPermitFallback(state: RampState, fromNetwork: EvmNetworks, signal?: AbortSignal): Promise<RampState> {
    if (state.state.isDirectTransfer) {
      await this.waitForUserHash(
        state,
        state.state.squidRouterNoPermitTransferHash as `0x${string}` | undefined,
        fromNetwork,
        "No-permit direct transfer",
        "squidRouterNoPermitTransfer",
        signal
      );
    } else {
      const hasApproveBlueprint = state.unsignedTxs.some(tx => tx.phase === "squidRouterNoPermitApprove");
      if (hasApproveBlueprint) {
        await this.waitForUserHash(
          state,
          state.state.squidRouterNoPermitApproveHash as `0x${string}` | undefined,
          fromNetwork,
          "No-permit approve",
          "squidRouterNoPermitApprove",
          signal
        );
      }
      await this.waitForUserHash(
        state,
        state.state.squidRouterNoPermitSwapHash as `0x${string}` | undefined,
        fromNetwork,
        "No-permit swap",
        "squidRouterNoPermitSwap",
        signal
      );
    }
    return state;
  }

  private async executeDirectTransfer(
    state: RampState,
    signedTypedDataArray: SignedTypedData[],
    fromNetwork: EvmNetworks,
    signal?: AbortSignal
  ): Promise<RampState> {
    if (!isSignedTypedDataArray(signedTypedDataArray) || signedTypedDataArray.length !== 1) {
      throw this.createUnrecoverableError("Invalid txData format for direct transfer: expected array of 1 SignedTypedData");
    }

    const [permitTypedData] = signedTypedDataArray;
    const permitSig = this.extractSignature(permitTypedData, "Permit");
    const { token, owner, spender, value, deadline } = extractPermitFields(permitTypedData);
    const ephemeralAddress = state.state.evmEphemeralAddress as `0x${string}`;
    const { walletClient, publicClient } = this.getExecutorClients(fromNetwork);

    await this.assertOwnerHasBalance(fromNetwork, token, owner, value, signal);
    const allowance = await abortableCall(signal, () =>
      publicClient.readContract({
        abi: erc20Abi,
        address: token,
        args: [owner, spender],
        functionName: "allowance"
      })
    );

    if (allowance >= value) {
      logger.info(`Existing allowance ${allowance} covers required ${value}, skipping permit for ramp ${state.id}`);
    } else {
      throwIfAborted(signal);
      const permitHash = await abortableCall(signal, () =>
        walletClient.writeContract({
          abi: permitAbi,
          address: token,
          args: [owner, spender, value, deadline, permitSig.v, permitSig.r, permitSig.s],
          functionName: "permit"
        })
      );
      logger.info(`Direct transfer permit tx sent: ${permitHash}`);
      const permitReceipt = await abortableCall(signal, () => publicClient.waitForTransactionReceipt({ hash: permitHash }));
      if (!permitReceipt || permitReceipt.status !== "success") {
        throw this.createRecoverableError(`Direct transfer permit tx failed: ${permitHash}`);
      }
    }

    throwIfAborted(signal);
    const transferHash = await abortableCall(signal, () =>
      walletClient.writeContract({
        abi: transferFromAbi,
        address: token,
        args: [owner, ephemeralAddress, value],
        functionName: "transferFrom"
      })
    );
    return this.saveHashAndAwaitReceipt(state, transferHash, fromNetwork, "Direct transfer", signal);
  }

  private async executeRelayerTransfer(
    state: RampState,
    signedTypedDataArray: SignedTypedData[],
    fromNetwork: EvmNetworks,
    signal?: AbortSignal
  ): Promise<RampState> {
    if (!isSignedTypedDataArray(signedTypedDataArray) || signedTypedDataArray.length !== 2) {
      throw this.createUnrecoverableError("Invalid txData format: expected array of 2 SignedTypedData objects");
    }

    const [permitTypedData, payloadTypedData] = signedTypedDataArray;
    const permitSig = this.extractSignature(permitTypedData, "Permit");
    const payloadSig = this.extractSignature(payloadTypedData, "Payload");
    const { token, owner, value, deadline } = extractPermitFields(permitTypedData);
    const payloadMessage = payloadTypedData.message;
    const executionValue = state.state.squidRouterPermitExecutionValue;
    if (executionValue === undefined || executionValue === null) {
      throw this.createUnrecoverableError("Missing squidRouterPermitExecutionValue in ramp state");
    }

    await this.assertOwnerHasBalance(fromNetwork, token, owner, value, signal);
    const { walletClient } = this.getExecutorClients(fromNetwork);
    throwIfAborted(signal);
    const hash = await abortableCall(signal, () =>
      walletClient.writeContract({
        abi: tokenRelayerAbi,
        address: getAlfredpayRelayerAddress(fromNetwork),
        args: [
          {
            deadline,
            owner,
            payloadData: payloadMessage.data as `0x${string}`,
            payloadDeadline: BigInt(payloadMessage.deadline as string),
            payloadNonce: BigInt(payloadMessage.nonce as string),
            payloadR: payloadSig.r,
            payloadS: payloadSig.s,
            payloadV: payloadSig.v,
            payloadValue: executionValue,
            permitR: permitSig.r,
            permitS: permitSig.s,
            permitV: permitSig.v,
            token,
            value
          }
        ],
        functionName: "execute",
        value: BigInt(executionValue)
      })
    );
    return this.saveHashAndAwaitReceipt(state, hash, fromNetwork, "Relayer execute", signal);
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    logger.info(`Executing squidRouterPermitExecute phase for ramp ${state.id}`);
    const fromNetwork = getNetworkFromDestination(state.from);
    if (!fromNetwork || !isNetworkEVM(fromNetwork)) {
      throw this.createUnrecoverableError(`Unsupported network for squidRouterPermitExecute phase: ${state.from}`);
    }

    try {
      if (state.state.isNoPermitFallback) return await this.executeNoPermitFallback(state, fromNetwork, signal);

      const existingHash = state.state.squidRouterPermitExecutionHash || null;
      if (existingHash) {
        try {
          const receipt = await abortableCall(signal, () =>
            this.evmClientManager.getClient(fromNetwork).waitForTransactionReceipt({
              hash: existingHash as `0x${string}`
            })
          );
          if (receipt?.status === "success") return state;
        } catch (error) {
          throwIfAborted(signal);
          logger.info(`Could not verify existing transaction status: ${error}, will retry`);
        }
      }

      const permitExecuteTransaction = this.getPresignedTransaction(state, "squidRouterPermitExecute");
      if (!permitExecuteTransaction) {
        throw this.createUnrecoverableError("Missing presigned transaction for squidRouterPermitExecute phase");
      }

      const signedTypedDataArray = permitExecuteTransaction.txData as SignedTypedData[];
      if (state.state.isDirectTransfer) {
        return await this.executeDirectTransfer(state, signedTypedDataArray, fromNetwork, signal);
      }

      const executionValue = state.state.squidRouterPermitExecutionValue;
      if (executionValue === undefined || executionValue === null) {
        throw this.createUnrecoverableError("Missing squidRouterPermitExecutionValue in ramp state");
      }
      const executionValueBigInt = BigInt(executionValue);
      const maxAllowedValue = 1000000000000000000n;
      if (executionValueBigInt > maxAllowedValue) {
        throw this.createUnrecoverableError(
          `squidRouterPermitExecutionValue ${executionValueBigInt} exceeds maximum allowed ${maxAllowedValue}`
        );
      }
      return await this.executeRelayerTransfer(state, signedTypedDataArray, fromNetwork, signal);
    } catch (error) {
      logger.error(`Error in squidRouterPermitExecute phase for ramp ${state.id}:`, error);
      if (error instanceof PhaseError) throw error;
      throw this.createRecoverableError(
        `AlfredpayOfframpPermitExecutor: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

const ALFREDPAY_POLL_INTERVAL_MS = 30000;
const ALFREDPAY_OFFRAMP_TIMEOUT_MS = 10 * 60 * 1000;

type AlfredpayFailedStatusError = { failureReason?: string; kind: "failed" };

function isAlfredpayFailedStatusError(error: unknown): error is AlfredpayFailedStatusError {
  return !!error && typeof error === "object" && "kind" in error && error.kind === "failed";
}

function getErrorName(error: unknown): string | undefined {
  return error && typeof error === "object" && "name" in error ? String(error.name) : undefined;
}

export class AlfredpayOfframpTransferExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "alfredpayOfframpTransfer";
  }

  public getMaxRetries(): number {
    return getAnchorPayoutMaxRetries();
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    if (isAnchorMockingEnabled()) {
      throw this.createRecoverableError("AlfredPay payout paused by MOCK_ANCHOR_OPERATIONS");
    }

    const { alfredpayTransactionId, alfredpayOfframpTransferTxHash } = state.state as StateMetadata;
    if (!alfredpayTransactionId) throw new Error("AlfredpayOfframpTransferExecutor: Missing alfredpayTransactionId in state.");

    const alfredpayApiService = AlfredpayApiService.getInstance();
    const evmClientManager = EvmClientManager.getInstance();
    let alfredpayTx = await abortableCall(signal, () => alfredpayApiService.getOfframpTransaction(alfredpayTransactionId));
    if (!alfredpayTx) {
      throw new Error(`AlfredpayOfframpTransferExecutor: Transaction ${alfredpayTransactionId} not found in Alfredpay.`);
    }

    if (!alfredpayOfframpTransferTxHash && new Date(alfredpayTx.expiration) < new Date()) {
      const recovered = await this.recreateAlfredpayOfframp(state, alfredpayTx, signal);
      if (!recovered) return this.transitionToNextPhase(state, "failed");
      alfredpayTx = recovered.alfredpayTx;
      state = recovered.state;
    }

    if (!alfredpayOfframpTransferTxHash) {
      const { txData: offrampTransfer } = this.getPresignedTransaction(state, "alfredpayOfframpTransfer");
      try {
        await ensurePresignedTransferFunded(
          offrampTransfer as `0x${string}`,
          Networks.Polygon as EvmNetworks,
          this.getPhaseName(),
          signal
        );
      } catch (error) {
        if (error instanceof PhaseError) throw error;
        throw this.createRecoverableError(
          `AlfredpayOfframpTransferExecutor: ephemeral balance does not cover the presigned final transfer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const network = Networks.Polygon as EvmNetworks;
      const signedTransaction = offrampTransfer as `0x${string}`;
      const deterministicHash = keccak256(signedTransaction);
      const networkClient = evmClientManager.getClient(network);
      const { hash: txHash } = await this.runFinancialOperation(state, {
        attemptClass: "alfredpay-final-transfer",
        externalId: result => result.hash,
        perform: async () => {
          throwIfAborted(signal);
          const hash = await abortableCall(signal, () =>
            evmClientManager.sendRawTransactionWithRetry(network, signedTransaction)
          );
          return { hash };
        },
        provider: "polygon",
        reconcile: async () => {
          try {
            const receipt = await abortableCall(signal, () => networkClient.getTransactionReceipt({ hash: deterministicHash }));
            if (receipt.status !== "success") {
              throw new FinancialOperationRejectedError(`Alfredpay final transfer ${deterministicHash} failed`);
            }
            await abortableCall(signal, () => networkClient.getTransaction({ hash: deterministicHash }));
            return { hash: deterministicHash };
          } catch (error) {
            throwIfAborted(signal);
            if (error instanceof FinancialOperationRejectedError) throw error;
            return null;
          }
        },
        request: { network, signedTransaction },
        signal
      });
      await state.update({ state: { ...state.state, alfredpayOfframpTransferTxHash: txHash } });
      logger.info(`AlfredpayOfframpTransferExecutor: Final transfer sent. Hash: ${txHash}`);
    } else {
      try {
        const client = evmClientManager.getClient(Networks.Polygon as EvmNetworks);
        const receipt = await abortableCall(signal, () =>
          client.getTransactionReceipt({ hash: alfredpayOfframpTransferTxHash as `0x${string}` })
        );
        if (receipt.status !== "success") {
          throw new Error(
            `AlfredpayOfframpTransferExecutor: Final transfer transaction ${alfredpayOfframpTransferTxHash} failed on chain.`
          );
        }
      } catch (error) {
        if (getErrorName(error) !== "TransactionReceiptNotFoundError") throw error;
      }
    }

    try {
      await this.pollAlfredpayOfframpStatus(alfredpayTx.transactionId, ALFREDPAY_POLL_INTERVAL_MS, signal);
    } catch (error) {
      if (isAlfredpayFailedStatusError(error)) return this.transitionToNextPhase(state, "failed");
      throw this.createRecoverableError(
        `AlfredpayOfframpTransferExecutor: Error polling Alfredpay status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return state;
  }

  private async recreateAlfredpayOfframp(
    state: RampState,
    expiredTx: Awaited<ReturnType<AlfredpayApiService["getOfframpTransaction"]>>,
    signal?: AbortSignal
  ): Promise<{ state: RampState; alfredpayTx: Awaited<ReturnType<AlfredpayApiService["getOfframpTransaction"]>> } | null> {
    const { alfredpayUserId, fiatAccountId, walletAddress } = state.state as StateMetadata;
    if (!alfredpayUserId || !fiatAccountId || !walletAddress) return null;

    const alfredpayApiService = AlfredpayApiService.getInstance();
    try {
      const toCurrency = expiredTx.toCurrency as AlfredpayFiatCurrency;
      const freshQuote = await abortableCall(signal, () =>
        alfredpayApiService.createOfframpQuote({
          chain: AlfredpayChain.MATIC,
          fromAmount: expiredTx.fromAmount,
          fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
          metadata: { businessId: "vortex", customerId: alfredpayUserId },
          paymentMethodType: AlfredpayPaymentMethodType.BANK,
          toCurrency
        })
      );
      throwIfAborted(signal);
      const newOrder = await abortableCall(signal, () =>
        alfredpayApiService.createOfframp({
          amount: expiredTx.fromAmount,
          chain: AlfredpayChain.MATIC,
          customerId: alfredpayUserId,
          fiatAccountId,
          fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
          originAddress: walletAddress,
          quoteId: freshQuote.quoteId,
          toCurrency
        })
      );
      if (newOrder.depositAddress.toLowerCase() !== expiredTx.depositAddress.toLowerCase()) return null;
      await state.update({ state: { ...state.state, alfredpayTransactionId: newOrder.transactionId } });
      const refreshedTx = await abortableCall(signal, () => alfredpayApiService.getOfframpTransaction(newOrder.transactionId));
      return { alfredpayTx: refreshedTx, state };
    } catch (error) {
      throwIfAborted(signal);
      logger.error(
        `AlfredpayOfframpTransferExecutor: Error during recovery: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async pollAlfredpayOfframpStatus(transactionId: string, intervalMs: number, signal?: AbortSignal): Promise<void> {
    const alfredpayApiService = AlfredpayApiService.getInstance();
    const startTime = Date.now();
    while (Date.now() - startTime <= ALFREDPAY_OFFRAMP_TIMEOUT_MS) {
      throwIfAborted(signal);
      try {
        const response = await abortableCall(signal, () => alfredpayApiService.getOfframpTransaction(transactionId));
        if (response.status === AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED) return;
        if (response.status === AlfredpayOfframpStatus.FAILED) {
          throw { failureReason: "Alfredpay reported FAILED status", kind: "failed" as const };
        }
      } catch (error) {
        if (isAlfredpayFailedStatusError(error)) throw error;
        throwIfAborted(signal);
        logger.warn(
          `AlfredpayOfframpTransferExecutor: Error polling Alfredpay status for ${transactionId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      await sleep(intervalMs, signal);
    }
    throw new Error(`AlfredpayOfframpTransferExecutor: Polling timed out after ${ALFREDPAY_OFFRAMP_TIMEOUT_MS}ms`);
  }
}

export { FinalSettlementSubsidyExecutor as AlfredpayOfframpSettlementExecutor };
export { FundEphemeralExecutor as AlfredpayOfframpFundExecutor };
