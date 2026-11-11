import {
  EvmClientManager,
  type EvmNetworks,
  getRelayIntentStatus,
  Networks,
  RampDirection,
  type RampPhase,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  type RelayIntentStatus,
  sleep
} from "@vortexfi/shared";
import { erc20Abi, keccak256 } from "viem";
import logger from "../../../../../../config/logger";
import QuoteTicket from "../../../../../../models/quoteTicket.model";
import type RampState from "../../../../../../models/rampState.model";
import { BasePhaseHandler } from "../../../../phases/base-phase-handler";
import type { StateMetadata } from "../../../../phases/meta-state-types";
import { getSquidRouterPayTimeoutMs } from "../../../../phases/phase-processor-config";
import { validatePresignedEvmTransactionAgainstUnsigned } from "../../../../transactions/validation";
import { abortableCall, throwIfAborted } from "../../core/cancellation";
import { resendPresignedTransaction } from "../../core/evm-transactions";
import { FinancialOperationRejectedError } from "../../core/financial-operation";
import { getBlockMetadata, getBlockState } from "../../core/metadata";
import { classifyStockRouteFailure } from "../uniswap-v3-fixed-swap/route";
import { StockRouteContext, type StockRouteState } from "./simulation";

const FILL_POLL_INTERVAL_MS = 10_000;

interface Receipt {
  status: "success" | "reverted";
}

export interface RelayBridgeDependencies {
  getBalance(network: EvmNetworks, token: `0x${string}`, owner: `0x${string}`): Promise<bigint>;
  getIntentStatus(requestId: string, signal?: AbortSignal): Promise<RelayIntentStatus>;
  getReceipt(hash: `0x${string}`): Promise<Receipt | null>;
  now(): number;
  sendRawTransaction(transaction: `0x${string}`): Promise<`0x${string}`>;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
  waitForReceipt(hash: `0x${string}`): Promise<Receipt>;
}

function defaultDependencies(): RelayBridgeDependencies {
  const manager = EvmClientManager.getInstance();
  const base = manager.getClient(Networks.Base);
  return {
    getBalance: (network, token, owner) =>
      manager.getClient(network).readContract({ abi: erc20Abi, address: token, args: [owner], functionName: "balanceOf" }),
    getIntentStatus: getRelayIntentStatus,
    async getReceipt(hash) {
      try {
        return await base.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    now: Date.now,
    sendRawTransaction: async transaction =>
      (await manager.sendRawTransactionWithRetry(Networks.Base, transaction)) as `0x${string}`,
    sleep: (milliseconds, signal) => abortableCall(signal, () => sleep(milliseconds)),
    waitForReceipt: hash => base.waitForTransactionReceipt({ hash })
  };
}

interface BridgeRoute {
  /** What must sit on the ephemeral before the ramp moves on. Ephemerals are fresh, so no baseline is needed. */
  arrival: { network: EvmNetworks; requiredRaw: bigint; token: `0x${string}` };
  /** X' on a buy. A sell has no Relay transaction, because its swap was the deposit. */
  depositAmountRaw?: bigint;
  ephemeral: `0x${string}`;
  requestId: string;
}

function resolveBridgeRoute(quoteMetadata: unknown, state: StateMetadata): BridgeRoute {
  const { bridge, direction } = getBlockMetadata(quoteMetadata, StockRouteContext);
  const { relayInputAmountRaw, relayMinimumOutputRaw, relayRequestId } = getBlockState<StockRouteState>(
    state,
    StockRouteContext
  );
  const ephemeral = state.evmEphemeralAddress as `0x${string}`;
  if (!ephemeral || !relayRequestId) throw new Error("ephemeral account or Relay request id is missing");
  if (direction !== RampDirection.BUY && direction !== RampDirection.SELL) throw new Error(`unknown direction ${direction}`);

  const route: BridgeRoute =
    direction === RampDirection.BUY
      ? {
          arrival: {
            network: Networks.Robinhood,
            requiredRaw: BigInt(bridge.outputAmountRaw),
            token: RELAY_ROBINHOOD_USDG_ADDRESS
          },
          depositAmountRaw: BigInt(relayInputAmountRaw as string),
          ephemeral,
          requestId: relayRequestId
        }
      : {
          arrival: {
            network: Networks.Base,
            requiredRaw: BigInt(relayMinimumOutputRaw as string),
            token: RELAY_BASE_USDC_ADDRESS
          },
          ephemeral,
          requestId: relayRequestId
        };
  if (route.arrival.requiredRaw <= 0n) throw new Error("required arrival amount is not positive");
  return route;
}

/** Buy: broadcasts the presigned Relay approve and deposit. Both directions: waits for the fill to reach the ephemeral. */
export class RelayBridgeExecutor extends BasePhaseHandler {
  constructor(private readonly injectedDependencies?: RelayBridgeDependencies) {
    super();
  }

  public getPhaseName(): RampPhase {
    return "relayBridge";
  }

  protected async executePhase(state: RampState, signal?: AbortSignal): Promise<RampState> {
    const dependencies = this.injectedDependencies ?? defaultDependencies();
    const pollUntil = dependencies.now() + getSquidRouterPayTimeoutMs();
    try {
      const route = await this.resolveRoute(state);
      if (route.depositAmountRaw !== undefined) {
        await this.broadcastDeposit(state, route, route.depositAmountRaw, dependencies, signal);
      }
      await this.waitForArrival(state, route, pollUntil, dependencies, signal);
      return state;
    } catch (error) {
      throw classifyStockRouteFailure(error);
    }
  }

  private async resolveRoute(state: RampState): Promise<BridgeRoute> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    try {
      return resolveBridgeRoute(quote?.metadata, state.state);
    } catch (error) {
      throw this.createReconciliationRequiredError(
        `Relay bridge route cannot be resolved: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async broadcastDeposit(
    state: RampState,
    route: BridgeRoute,
    depositAmountRaw: bigint,
    dependencies: RelayBridgeDependencies,
    signal?: AbortSignal
  ): Promise<void> {
    const approve = await this.validatedTransaction(state, "relayApprove");
    const deposit = await this.validatedTransaction(state, "relayBridge");
    // A reverted deposit burns its nonce and leaves an operator to recover, so both wait for the input to settle.
    const assertInputSettled = async () => {
      const balance = await dependencies.getBalance(Networks.Base, RELAY_BASE_USDC_ADDRESS, route.ephemeral);
      if (balance < depositAmountRaw) {
        throw this.createRecoverableError(`Relay deposit input is not on the ephemeral yet: ${balance} of ${depositAmountRaw}`);
      }
    };
    await this.broadcast(state, "relay-approve", approve, assertInputSettled, dependencies, signal);
    const relayBridgeHash = await this.broadcast(state, "relay-deposit", deposit, assertInputSettled, dependencies, signal);
    if (state.state.relayBridgeHash !== relayBridgeHash) {
      await state.update({ state: { ...state.state, relayBridgeHash } });
    }
  }

  /** No retry can change a presigned transaction, so a bad one pauses for an operator. */
  private async validatedTransaction(state: RampState, phase: RampPhase): Promise<`0x${string}`> {
    try {
      const signed = state.presignedTxs?.find(tx => tx.phase === phase);
      const unsigned = state.unsignedTxs.find(tx => tx.phase === phase);
      if (!signed || !unsigned) throw new Error("it is missing");
      await validatePresignedEvmTransactionAgainstUnsigned(signed, unsigned);
      return signed.txData as `0x${string}`;
    } catch (error) {
      throw this.createReconciliationRequiredError(
        `Presigned ${phase} cannot be broadcast: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async broadcast(
    state: RampState,
    attemptClass: "relay-approve" | "relay-deposit",
    transaction: `0x${string}`,
    beforePerform: () => Promise<void>,
    dependencies: RelayBridgeDependencies,
    signal?: AbortSignal
  ): Promise<`0x${string}`> {
    const deterministicHash = keccak256(transaction);
    const assertMined = (receipt: Receipt, hash: `0x${string}`) => {
      if (receipt.status !== "success") throw new FinancialOperationRejectedError(`Relay transaction ${hash} reverted`);
      return { hash };
    };
    const { hash } = await this.runFinancialOperation(state, {
      attemptClass,
      beforePerform,
      externalId: value => value.hash,
      perform: async () => {
        throwIfAborted(signal);
        const sentHash = await dependencies.sendRawTransaction(transaction);
        if (sentHash.toLowerCase() !== deterministicHash.toLowerCase()) {
          throw new Error(`Relay transaction returned hash ${sentHash}, expected ${deterministicHash}`);
        }
        return assertMined(await dependencies.waitForReceipt(sentHash), sentHash);
      },
      provider: Networks.Base,
      // Only a claimed row may have been sent; an unclaimed one goes through beforePerform and the claim first.
      reconcile: async operation => {
        const receipt =
          (await dependencies.getReceipt(deterministicHash)) ??
          (operation.status === "not_started" ? null : await resendPresignedTransaction(transaction, dependencies));
        return receipt && assertMined(receipt, deterministicHash);
      },
      request: { network: Networks.Base, signedTransaction: transaction },
      signal
    });
    return hash;
  }

  private async waitForArrival(
    state: RampState,
    route: BridgeRoute,
    pollUntil: number,
    dependencies: RelayBridgeDependencies,
    signal?: AbortSignal
  ): Promise<void> {
    const { network, requiredRaw, token } = route.arrival;
    let lastObservation: string;
    do {
      throwIfAborted(signal);
      const status = await this.readStatus(route, dependencies, signal);
      this.assertNotRefunded(route, status);
      lastObservation = status?.status ?? "status unavailable";
      if (!status || status.status === "success") {
        const balance = await dependencies.getBalance(network, token, route.ephemeral);
        if (balance >= requiredRaw) {
          if (!status) {
            logger.warn(
              `RELAY_ARRIVAL_BALANCE_FALLBACK: accepting balance ${balance} without a Relay status. ramp=${state.id} request=${route.requestId}`
            );
          }
          await this.recordHashes(state, status);
          return;
        }
        lastObservation += `, balance ${balance} of ${requiredRaw}`;
      }
      await dependencies.sleep(FILL_POLL_INTERVAL_MS, signal);
    } while (dependencies.now() < pollUntil);

    throw this.createRecoverableError(`Relay request ${route.requestId} has not filled yet (${lastObservation})`);
  }

  private async readStatus(
    route: BridgeRoute,
    dependencies: RelayBridgeDependencies,
    signal?: AbortSignal
  ): Promise<RelayIntentStatus | null> {
    try {
      return await dependencies.getIntentStatus(route.requestId, signal);
    } catch (error) {
      throwIfAborted(signal);
      logger.warn(
        `Relay status for ${route.requestId} is unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /** The funds are back on the ephemeral on the origin chain, or Relay gave up refunding them. Either way an operator takes over. */
  private assertNotRefunded(route: BridgeRoute, status: RelayIntentStatus | null): void {
    if (status?.status === "refund") {
      throw this.createReconciliationRequiredError(
        `Relay refunded request ${route.requestId} (${status.failReason ?? "no reason given"})`
      );
    }
    if (status?.status === "failure" && status.refundFailReason) {
      throw this.createReconciliationRequiredError(
        `Relay could not refund failed request ${route.requestId} (${status.refundFailReason})`
      );
    }
  }

  private async recordHashes(state: RampState, status: RelayIntentStatus | null): Promise<void> {
    const relayBridgeHash = state.state.relayBridgeHash ?? status?.inTxHashes[0];
    const relayFillHash = status?.txHashes[0];
    await state.update({
      state: {
        ...state.state,
        ...(relayBridgeHash ? { relayBridgeHash } : {}),
        ...(relayFillHash ? { relayFillHash } : {})
      }
    });
  }
}
