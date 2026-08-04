import { submitExtrinsic } from "@pendulum-chain/api-solang";
import {
  ApiManager,
  checkEvmBalanceForToken,
  decodeSubmittableExtrinsic,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  evmTokenConfig,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, keccak256, parseTransaction } from "viem";
import logger from "../../../../../../config/logger";
import { config } from "../../../../../../config/vars";
import FinancialOperation from "../../../../../../models/financialOperation.model";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import RampState from "../../../../../../models/rampState.model";
import { PhaseError, requiresManualReconciliation } from "../../../../../errors/phase-error";
import { fetchWithTimeout } from "../../../../../helpers/fetchWithTimeout";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata } from "../../core/metadata";
import { DistributeFeesContext, type DistributeFeesMetadata } from "./simulation";

const FEE_BALANCE_POLL_INTERVAL_MS = 5_000;
const FEE_BALANCE_POLL_TIMEOUT_MS = 60_000;

// EVM slice of the production DistributeFeesHandler: verifies the ephemeral holds enough USDC on
// Base to cover the USD fees, then broadcasts the presigned fee-distribution transaction. The
// substrate (Pendulum/Subscan) branch is not ported.
export class DistributeFeesExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "distributeFees";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const quote = await QuoteTicket.findOne({ where: { id: state.quoteId } });
    if (!quote) {
      throw this.createUnrecoverableError(`Quote ticket not found for ID: ${state.quoteId}`);
    }

    const existingHash = state.state.distributeFeeHash || null;
    const metadata = getBlockMetadata(quote.metadata, DistributeFeesContext);
    if (metadata.network === Networks.Pendulum) {
      try {
        if (existingHash && (await this.isPendulumExtrinsicSuccessful(existingHash, signal))) return state;
        const transaction = this.getPresignedTransaction(state, "distributeFees");
        if (!transaction) return state;
        const substrateAddress = state.state.substrateEphemeralAddress;
        if (!substrateAddress || !metadata.outputCurrencyId || metadata.outputDecimals === undefined) {
          throw new Error("DistributeFeesExecutor: missing Pendulum state");
        }
        const manager = ApiManager.getInstance();
        const pendulum = await manager.getApi("pendulum");
        const required = multiplyByPowerOfTen(metadata.totalFeesUsd, metadata.outputDecimals);
        const balance = await pendulum.api.query.tokens.accounts(substrateAddress, metadata.outputCurrencyId);
        const available = new Big((balance as unknown as { free?: { toString(): string } }).free?.toString() ?? "0");
        if (available.lt(required)) throw this.createRecoverableError("Pendulum fee balance is not available");
        throwIfAborted(signal);
        const { hash } = await this.runFinancialOperation(state, {
          attemptClass: "substrate-fee-distribution",
          externalId: result => result.hash,
          perform: async () => {
            throwIfAborted(signal);
            const result = await abortableCall(signal, () =>
              submitExtrinsic(decodeSubmittableExtrinsic(transaction.txData as string, pendulum.api))
            );
            if (result.status.type === "error") {
              throw new FinancialOperationRejectedError("Pendulum fee distribution failed");
            }
            return { hash: result.txHash.toString() };
          },
          provider: Networks.Pendulum,
          request: { network: Networks.Pendulum, signedTransaction: transaction.txData },
          signal
        });
        state.state = { ...state.state, distributeFeeHash: hash };
        await state.update({ state: state.state });
        return state;
      } catch (e) {
        logger.error(`Error distributing Pendulum fees for ramp ${state.id}:`, e);
        if (e instanceof PhaseError) throw e;
        const error = e instanceof Error ? e : new Error(String(e));
        throw this.createRecoverableError(`Failed to distribute Pendulum fees: ${error.message}`);
      }
    }
    try {
      const feeTxs = (state.presignedTxs ?? []).filter(tx => tx.phase === "distributeFees").sort((a, b) => a.nonce - b.nonce);
      if (feeTxs.length === 0) {
        logger.info("No fee distribution transaction data found. Skipping fee distribution.");
        return state;
      }
      for (const feeTx of feeTxs) {
        if (typeof feeTx.txData !== "string" || !feeTx.txData.startsWith("0x")) {
          throw new Error("DistributeFeesExecutor: Invalid presigned EVM transaction data");
        }
      }

      const network = feeTxs[0].network as EvmNetworks;
      const evmClientManager = EvmClientManager.getInstance();
      const client = evmClientManager.getClient(network);

      // The first transfer keeps the legacy attempt class so in-flight ramps
      // registered with a single fee transaction resume against their existing
      // financial-operation row; later transfers are keyed by blueprint nonce.
      const attemptClassOf = (index: number, feeTx: { nonce: number }) =>
        index === 0 ? "evm-fee-distribution" : `evm-fee-distribution:${feeTx.nonce}`;

      // Classify every transfer BEFORE the balance precondition. Both `confirmed`
      // (broadcast accepted) and an ambiguous `submitted`/`unknown` operation may mean
      // the funds already left the ephemeral, so counting them as unpaid could demand
      // a balance that can never return and wedge the phase — the balance check runs
      // before the loop's reconcile would ever see the successful receipt. Only
      // transfers with no operation, or a safely reclaimable `not_started` one, count
      // as unpaid; ambiguous operations are resolved from chain truth here.
      const operations = await FinancialOperation.findAll({
        where: { phase: "distributeFees", scopeId: state.id, scopeType: "ramp" }
      });
      const operationByClass = new Map(operations.map(op => [op.attemptClass, op]));
      const pendingTxs: typeof feeTxs = [];
      for (const [index, feeTx] of feeTxs.entries()) {
        const operation = operationByClass.get(attemptClassOf(index, feeTx));
        if (!operation || operation.status === "not_started") {
          pendingTxs.push(feeTx);
          continue;
        }
        if (operation.status === "confirmed") {
          // Replays below without a second broadcast; the funds may have left.
          continue;
        }
        if (operation.status === "failed") {
          throw this.createReconciliationRequiredError(
            `Fee distribution transfer at nonce ${feeTx.nonce} previously failed definitively (operation ${operation.id}); manual recovery required.`
          );
        }
        // submitted/unknown: the broadcast outcome is ambiguous. A mined success means
        // the amount already left the ephemeral (treat as paid; the loop's reconcile
        // settles the operation row), a mined revert consumed the nonce, and a missing
        // receipt is exactly the ambiguity the architecture halts on — reconcile could
        // only reach the same conclusion after a misleading balance timeout.
        const deterministicHash = keccak256(feeTx.txData as `0x${string}`);
        const receipt = await abortableCall(signal, () =>
          client.getTransactionReceipt({ hash: deterministicHash }).catch(() => null)
        );
        throwIfAborted(signal);
        if (receipt?.status === "success") {
          continue;
        }
        if (receipt) {
          throw this.createReconciliationRequiredError(
            `Fee distribution transfer at nonce ${feeTx.nonce} was mined but REVERTED (hash ${deterministicHash}); its nonce is consumed and the presigned transaction cannot execute again.`
          );
        }
        throw this.createReconciliationRequiredError(
          `Fee distribution transfer at nonce ${feeTx.nonce} has an ambiguous broadcast (operation ${operation.id} is ${operation.status}) and no receipt; manual reconciliation required.`
        );
      }

      if (pendingTxs.length > 0) {
        // The fee token may not yet be on the ephemeral when we reach this phase.
        // Poll for the UNPAID amount only; if it never arrives within the timeout,
        // throw a recoverable error so we retry the phase.
        await this.ensureEvmFeeTokenBalance(metadata, network, pendingTxs, signal);
      }

      let currentState = state;
      for (const [index, feeTx] of feeTxs.entries()) {
        const signedTransaction = feeTx.txData as `0x${string}`;
        const deterministicHash = keccak256(signedTransaction);
        logger.info(`Submitting EVM fee distribution transfer (nonce ${feeTx.nonce}) for ramp ${state.id}...`);
        const { hash: actualTxHash } = await this.runFinancialOperation(currentState, {
          attemptClass: attemptClassOf(index, feeTx),
          externalId: result => result.hash,
          perform: async () => {
            throwIfAborted(signal);
            const hash = await abortableCall(signal, () =>
              evmClientManager.sendRawTransactionWithRetry(network, signedTransaction)
            );
            return { hash };
          },
          provider: network,
          reconcile: async () => {
            try {
              const receipt = await abortableCall(signal, () => client.getTransactionReceipt({ hash: deterministicHash }));
              if (receipt.status !== "success") {
                throw new FinancialOperationRejectedError(`Fee distribution transaction ${deterministicHash} failed`);
              }
              await abortableCall(signal, () => client.getTransaction({ hash: deterministicHash }));
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

        logger.info(`Transaction broadcast with hash ${actualTxHash}. Persisting hash...`);
        currentState = await currentState.update({
          state: {
            ...currentState.state,
            distributeFeeHash: actualTxHash
          }
        });

        await this.waitForEvmTransactionSuccess(actualTxHash, network, signal);
        logger.info(`Fee distribution transfer confirmed for ramp ${state.id}: ${actualTxHash}`);
      }

      return currentState;
    } catch (e: unknown) {
      logger.error(`Error distributing fees for ramp ${state.id}:`, e);

      if (e instanceof FinancialOperationRejectedError) {
        // A fee transfer was mined but REVERTED: its nonce is consumed, so the
        // presign can never execute again and automatic retries could only loop.
        // Halt for manual recovery.
        throw this.createReconciliationRequiredError(`Fee distribution transfer reverted on-chain: ${e.message}`);
      }
      if (requiresManualReconciliation(e)) {
        // Ambiguous financial-operation outcomes must halt, not retry; wrapping them
        // as recoverable would discard the reconciliation marker.
        throw this.createReconciliationRequiredError((e as Error).message);
      }
      if (e instanceof PhaseError) {
        throw e;
      }

      const error = e instanceof Error ? e : new Error(String(e));
      throw this.createRecoverableError(`Failed to distribute fees: ${error.message || "Unknown error"}`);
    }
  }

  private getFeeTokenDetails(network: EvmNetworks, metadata: DistributeFeesMetadata): EvmTokenDetails {
    // Quotes created before the network parameterization carry no feeToken; those
    // corridors all distribute USDC on Base.
    const feeToken = metadata.feeToken ?? EvmToken.USDC;
    const tokenDetails = evmTokenConfig[network]?.[feeToken] as EvmTokenDetails | undefined;
    if (!tokenDetails) {
      throw this.createUnrecoverableError(`${network} ${feeToken} configuration not found; cannot verify fee balance.`);
    }
    return tokenDetails;
  }

  private computeRequiredFeeRaw(metadata: DistributeFeesMetadata, decimals: number): Big | null {
    const totalUsd = new Big(metadata.totalFeesUsd);
    if (totalUsd.lte(0)) {
      return null;
    }

    return multiplyByPowerOfTen(totalUsd, decimals);
  }

  /**
   * Sums the ERC-20 transfer amounts of the given presigned fee transactions. Returns
   * null when any transaction is not a plain `transfer` (e.g. a legacy presign from
   * before the sequential-transfer change), signalling the caller to fall back to the
   * quote's full fee total.
   */
  private computePendingFeeRaw(pendingTxs: { txData: unknown }[]): Big | null {
    let total = new Big(0);
    for (const feeTx of pendingTxs) {
      try {
        const parsed = parseTransaction(feeTx.txData as `0x${string}`);
        if (!parsed.data) {
          return null;
        }
        const decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data });
        if (decoded.functionName !== "transfer") {
          return null;
        }
        const [, amount] = decoded.args as [string, bigint];
        total = total.plus(amount.toString());
      } catch {
        return null;
      }
    }
    return total;
  }

  private async ensureEvmFeeTokenBalance(
    metadata: DistributeFeesMetadata,
    network: EvmNetworks,
    pendingTxs: { txData: unknown; signer: string }[],
    signal?: AbortSignal
  ): Promise<void> {
    const tokenDetails = this.getFeeTokenDetails(network, metadata);
    const signerAddress = pendingTxs[0].signer;

    const requiredRaw = this.computePendingFeeRaw(pendingTxs) ?? this.computeRequiredFeeRaw(metadata, tokenDetails.decimals);
    if (!requiredRaw?.gt(0)) {
      logger.info("No positive USD fees configured; skipping fee balance precondition check.");
      return;
    }

    logger.info(
      `Checking EVM fee balance: signer=${signerAddress} requires >= ${requiredRaw.toFixed(0)} ${tokenDetails.assetSymbol} raw on ${network} before submitting fee distribution.`
    );

    try {
      const balance = await checkEvmBalanceForToken({
        amountDesiredRaw: requiredRaw.toFixed(0),
        chain: network,
        intervalMs: FEE_BALANCE_POLL_INTERVAL_MS,
        ownerAddress: signerAddress,
        signal,
        timeoutMs: FEE_BALANCE_POLL_TIMEOUT_MS,
        tokenDetails
      });
      logger.info(`EVM fee balance precondition met: balance=${balance.toFixed(0)} >= required=${requiredRaw.toFixed(0)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw this.createRecoverableError(
        `Fee distribution precondition failed: ${tokenDetails.assetSymbol} balance not available on ${signerAddress} within ${FEE_BALANCE_POLL_TIMEOUT_MS}ms. ${message}`
      );
    }
  }

  /**
   * Tri-state receipt wait: a missing receipt keeps polling (recoverable timeout), a
   * successful receipt returns, and a mined-but-REVERTED receipt throws
   * `FinancialOperationRejectedError` immediately — the operation row was already
   * marked confirmed at broadcast, so its reconcile callback will never run again and
   * this is the only place the revert can be detected.
   */
  private async waitForEvmTransactionSuccess(txHash: string, network: EvmNetworks, signal?: AbortSignal): Promise<void> {
    const publicClient = EvmClientManager.getInstance().getClient(network);
    await waitUntilTrueWithTimeout(
      async () => {
        const receipt = await abortableCall(signal, () =>
          publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null)
        );
        throwIfAborted(signal);
        if (!receipt) {
          return false;
        }
        if (receipt.status !== "success") {
          throw new FinancialOperationRejectedError(
            `Fee distribution transfer ${txHash} was mined but REVERTED; its nonce is consumed and the presigned transaction cannot execute again.`
          );
        }
        return true;
      },
      2000, // check every 2 seconds
      180000, // timeout after 3 minutes
      signal
    );
  }

  private async isPendulumExtrinsicSuccessful(extrinsicHash: string, signal?: AbortSignal): Promise<boolean> {
    const response = await abortableCall(signal, () =>
      fetchWithTimeout("https://pendulum.api.subscan.io/api/scan/extrinsic", {
        body: JSON.stringify({ events_limit: 10, hash: extrinsicHash, hide_events: false }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.subscanApiKey || ""
        },
        method: "POST"
      })
    );
    if (!response.ok) throw new Error(`Subscan API response error: ${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data.code !== 0) throw new Error(`Subscan API error code: ${data.code}, message: ${data.message}`);
    return data.data?.success === true;
  }
}
