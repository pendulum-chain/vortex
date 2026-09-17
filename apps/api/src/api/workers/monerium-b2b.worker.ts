import { CronJob } from "cron";
import { QueryTypes } from "sequelize";
import sequelize from "../../config/database";
import logger from "../../config/logger";
import { MoneriumFiatDepositStatus } from "../../models/moneriumFiatDeposit.model";
import { isKeeperChainConfigured } from "../services/monerium-b2b/chain";
import { runConversionExecutor } from "../services/monerium-b2b/conversion-executor";
import { processMoneriumWebhookInbox, pruneProcessedWebhookEvents } from "../services/monerium-b2b/deposit-processor";
import { runDormancyGate } from "../services/monerium-b2b/dormancy";
import { emitMoneriumDepositEvents } from "../services/monerium-b2b/manager-events";
import { runMintWatcher } from "../services/monerium-b2b/mint-watcher";
import { runMonitoringPass } from "../services/monerium-b2b/monitoring";
import { advanceOnboardingAccounts } from "../services/monerium-b2b/onboarding";

const DEFAULT_CRON_TIME = "* * * * *"; // every minute

/**
 * Keeper loop for the Monerium B2B onramp (plan §3): webhook inbox -> mint watcher ->
 * per-account conversion executor -> dormancy gate (R05). Chain steps are skipped
 * (inbox processing still runs) until MONERIUM_B2B_RPC_URL and
 * MONERIUM_B2B_KEEPER_PRIVATE_KEY are configured.
 */
class MoneriumB2bWorker {
  private job: CronJob;
  private running = false;
  private chainConfigWarned = false;

  constructor(cronTime = DEFAULT_CRON_TIME) {
    this.job = new CronJob(cronTime, this.cycle.bind(this), null, false, undefined, null, true);
  }

  public start(): void {
    logger.info("Starting Monerium B2B keeper worker");
    this.job.start();
  }

  public stop(): void {
    logger.info("Stopping Monerium B2B keeper worker");
    this.job.stop();
  }

  private async cycle(): Promise<void> {
    if (this.running) {
      return; // previous cycle (e.g. waiting on a receipt) still in progress
    }
    this.running = true;
    try {
      await processMoneriumWebhookInbox();

      // Link + IBAN issuance for mapped accounts still in onboarding; internally
      // gated on the whitelabel credentials, attestor key, and read RPC.
      await advanceOnboardingAccounts();

      if (!isKeeperChainConfigured()) {
        if (!this.chainConfigWarned) {
          this.chainConfigWarned = true;
          logger.warn(
            "monerium-b2b: MONERIUM_B2B_RPC_URL / MONERIUM_B2B_KEEPER_PRIVATE_KEY not configured — keeper chain steps disabled"
          );
        }
      } else {
        const mintedAccountIds = await runMintWatcher();
        const candidateIds = await this.conversionCandidates(mintedAccountIds);
        for (const accountId of candidateIds) {
          try {
            await runConversionExecutor(accountId);
          } catch (error) {
            logger.error(`monerium-b2b: conversion executor failed for account ${accountId}:`, error);
          }
        }

        await runDormancyGate();
      }

      // Manager-facing deposit events into the durable webhook outbox; the
      // converted event self-gates on the read RPC for its confirmation depth.
      await emitMoneriumDepositEvents();

      // Bounded retention for the durable inbox (dedup only needs the retry horizon).
      await pruneProcessedWebhookEvents();

      // Detection-only monitors (plan D3); internally rate-limited and gated on the
      // read RPC / API credentials, so this is safe to call every cycle.
      await runMonitoringPass();
    } catch (error) {
      logger.error("Error during Monerium B2B keeper cycle:", error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Accounts worth running the executor for: settled mints from this cycle and accounts
   * with chain-indexed deposits still settling (converting, awaiting their forward, or
   * marked for recovery). The executor never outruns the watcher's reorg-safety window
   * merely because a live balance is visible.
   */
  private async conversionCandidates(mintedAccountIds: string[]): Promise<string[]> {
    const candidates = new Set<string>(mintedAccountIds);

    const outstanding = await sequelize.query<{ accountId: string }>(
      `SELECT DISTINCT account_id AS "accountId"
       FROM monerium_fiat_deposits
       WHERE status IN (:settling)
         AND block_number IS NOT NULL`,
      {
        replacements: {
          settling: [
            MoneriumFiatDepositStatus.Minted,
            MoneriumFiatDepositStatus.Converting,
            MoneriumFiatDepositStatus.Recovering
          ]
        },
        type: QueryTypes.SELECT
      }
    );
    for (const row of outstanding) {
      candidates.add(row.accountId);
    }

    return [...candidates];
  }
}

export default MoneriumB2bWorker;
