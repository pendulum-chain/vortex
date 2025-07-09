import { BrlaApiService, verifyReferenceLabel } from "@packages/shared";
import logger from "../../../config/logger";
import { BrlaSupportedChain, FastQuoteQueryParams, OnchainLog, SmartContractOperationType } from "./types";

// This service is used to request and keep tracks of teleports (transfers) from BRLA's
// controlled accounts.
// The process involves: requesting a "fast quote" for a swap, between BRLA -> BRLA on Moonbeam,
// executing a swap operation corresponding to the quote, and finally, confirming the swap.

// The first step is a "claim" step, where the user claims making the payment. We wait until the minting is
// confirmed to quote and start the transfer.

export type EvmAddress = `0x${string}`;

type TeleportStatus = "claimed" | "arrived" | "quoted" | "started" | "completed" | "failed";

type Teleport = {
  amount: number;
  subaccountId: string;
  dateRequested: string;
  status: TeleportStatus;
  receiverAddress: EvmAddress;
  memo: string;
  id?: string;
};

export class BrlaTeleportService {
  private static teleportService: BrlaTeleportService;

  private brlaApiService: BrlaApiService;

  private checkInterval: NodeJS.Timeout | null = null;

  private intervalMs = 10000;

  // Key is a composite of subaccountId and memo: `${subaccountId}:${memo}`
  private teleports: Map<string, Teleport> = new Map();

  private completedTeleports: Map<string, Teleport> = new Map();

  constructor(intervalMs?: number) {
    this.brlaApiService = BrlaApiService.getInstance();

    if (intervalMs) {
      this.intervalMs = intervalMs;
    }
  }

  public static getInstance(): BrlaTeleportService {
    if (!BrlaTeleportService.teleportService) {
      BrlaTeleportService.teleportService = new BrlaTeleportService();
    }
    return BrlaTeleportService.teleportService;
  }

  private getCompositeKey(subaccountId: string, memo: string): string {
    const safeMemo = typeof memo === "string" ? memo : "";
    return `${subaccountId}:${safeMemo}`;
  }

  public async requestTeleport(subaccountId: string, amount: number, receiverAddress: EvmAddress, memo: string): Promise<void> {
    const compositeKey = this.getCompositeKey(subaccountId, memo);
    const existing = this.teleports.get(compositeKey);

    if (
      existing &&
      existing.amount === amount &&
      existing.receiverAddress === receiverAddress &&
      (existing.status === "claimed" || existing.status === "started")
    ) {
      logger.info(
        `Skipping duplicate teleport request for subaccount ${subaccountId}, memo "${memo}" ` +
          `(amount=${amount}, receiver=${receiverAddress}). Current status: ${existing.status}.`
      );
      return;
    }

    const teleport: Teleport = {
      amount,
      dateRequested: new Date().toISOString(),
      memo,
      receiverAddress,
      status: "claimed",
      subaccountId
    };
    logger.info(`Requesting teleport ${compositeKey}: ${JSON.stringify(teleport)}`);
    this.teleports.set(compositeKey, teleport);
    this.maybeStartPeriodicChecks();
  }

  public cancelPendingTeleport(subaccountId: string, memo: string): void {
    const compositeKey = this.getCompositeKey(subaccountId, memo);
    const pending = this.teleports.get(compositeKey);
    if (pending) {
      this.teleports.delete(compositeKey);
      logger.info(`Cancelled pending teleport for key "${compositeKey}" (subaccount ${subaccountId}, memo "${memo}").`);
    } else {
      logger.info(
        `No pending teleport found to cancel for key "${compositeKey}" (subaccount ${subaccountId}, memo "${memo}").`
      );
    }
  }

  private async startTeleport(compositeKey: string): Promise<void> {
    const teleport = this.teleports.get(compositeKey);

    if (teleport === undefined) {
      logger.error(`Teleport not found for key "${compositeKey}" at startTeleport. This should not happen.`);
      return;
    }

    if (teleport.status !== "arrived") {
      logger.warn(`Teleport "${compositeKey}" not in 'arrived' state.`);
      return;
    }

    logger.info(`Starting teleport "${compositeKey}":`, teleport);
    const fastQuoteParams: FastQuoteQueryParams = {
      amount: Number(teleport.amount),
      chain: BrlaSupportedChain.BRLA,
      fixOutput: true,
      inputCoin: "BRLA",
      operation: "swap",
      outputCoin: "BRLA",
      subaccountId: teleport.subaccountId
    };

    try {
      const { token: quoteToken } = await this.brlaApiService.createFastQuote(fastQuoteParams);
      const quotedTeleportState: Teleport = { ...teleport, status: "quoted" };
      this.teleports.set(compositeKey, quotedTeleportState);
      logger.info(`Teleport ${compositeKey} status: quoted`);

      const { id } = await this.brlaApiService.swapRequest({
        receiverAddress: quotedTeleportState.receiverAddress,
        token: quoteToken
      });

      const startedTeleportState: Teleport = { ...quotedTeleportState, id, status: "started" };
      this.teleports.set(compositeKey, startedTeleportState);
      logger.info(`Teleport ${compositeKey} status: started, API operationId: ${id}`);

      this.maybeStartPeriodicChecks();
    } catch (e) {
      logger.error(`Error starting teleport "${compositeKey}":`, e);
      this.teleports.set(compositeKey, { ...teleport, status: "failed" });
    }
  }

  private maybeStartPeriodicChecks(): void {
    const pendingTeleports = [...this.teleports.values()].filter(
      teleport => teleport.status === "claimed" || teleport.status === "started"
    ).length;

    if (this.checkInterval === null && pendingTeleports > 0) {
      this.checkInterval = setInterval(() => {
        this.checkPendingTeleports().catch(err => {
          logger.error("Error in periodic teleport check:", err);
        });
      }, this.intervalMs);
    }
  }

  private async checkPendingTeleports(): Promise<void> {
    if (this.teleports.size === 0 && this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      return;
    }

    // Process 'started' teleports first
    for (const [compositeKey, teleport] of this.teleports) {
      if (teleport.status === "started") {
        try {
          const onChainOuts = await this.brlaApiService.getOnChainHistoryOut(teleport.subaccountId);
          const relevantOut = onChainOuts.find((out: OnchainLog) => out.id === teleport.id);

          if (!relevantOut) {
            return;
          }

          // We are interested in the last contract op for this operation being
          // a mint one. smartContractOps are ordered descending by timestamp.
          const lastContractOp = relevantOut.smartContractOps[0];

          if (
            lastContractOp &&
            lastContractOp.operationName === SmartContractOperationType.MINT &&
            lastContractOp.executed === true
          ) {
            const completedTeleport = { ...teleport, status: "completed" as TeleportStatus };
            this.completedTeleports.set(compositeKey, completedTeleport);
            logger.info(`Teleport completed "${compositeKey}":`, completedTeleport);
            this.teleports.delete(compositeKey);
          }
        } catch (error) {
          logger.error(`Error checking 'started' teleport ${compositeKey}:`, error);
        }
      }
    }

    // Process 'claimed' teleports
    for (const [compositeKey, teleport] of this.teleports) {
      if (teleport.status === "claimed") {
        try {
          const payIns = await this.brlaApiService.getPayInHistory(teleport.subaccountId);
          if (payIns.length === 0) {
            return;
          }

          // Must be the last one, if any.
          const matchingPayIn = payIns.find(
            payIn =>
              verifyReferenceLabel(payIn.referenceLabel, teleport.memo) && Number(payIn.amount) >= Number(teleport.amount)
          );

          if (matchingPayIn) {
            logger.info(`Matching PayIn found for teleport "${compositeKey}". Status changing to 'arrived'.`);
            this.teleports.set(compositeKey, { ...teleport, status: "arrived" });
            // Intentionally not awaiting startTeleport to allow checkPendingTeleports to complete its iteration.
            // startTeleport is async and will handle its own errors.
            this.startTeleport(compositeKey).catch(err => {
              logger.error(`Error occurred during startTeleport called for ${compositeKey} from checkPendingTeleports:`, err);
            });
          } // Deletion of teleports is handled by the phase processor.
        } catch (error) {
          logger.error(`Error checking 'claimed' teleport ${compositeKey}:`, error);
        }
      }
    }
  }
}
