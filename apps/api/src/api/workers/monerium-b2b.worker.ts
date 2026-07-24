import { CronJob } from "cron";
import { Op } from "sequelize";
import { Address } from "viem";
import logger from "../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../models/moneriumAccount.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../models/moneriumFiatDeposit.model";
import { erc20Abi, getForwarderImmutables, getPublicClient, isKeeperChainConfigured } from "../services/monerium-b2b/chain";
import { runConversionExecutor } from "../services/monerium-b2b/conversion-executor";
import { processMoneriumWebhookInbox } from "../services/monerium-b2b/deposit-processor";
import { runDormancyGate } from "../services/monerium-b2b/dormancy";
import { runMintWatcher } from "../services/monerium-b2b/mint-watcher";
import { runMonitoringPass } from "../services/monerium-b2b/monitoring";

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
   * Accounts worth running the executor for: fresh mints from this cycle, accounts with
   * minted-but-unallocated deposits, and accounts whose forwarder holds a nonzero EURe
   * balance (covers inflows the watcher has not indexed yet).
   */
  private async conversionCandidates(mintedAccountIds: string[]): Promise<string[]> {
    const candidates = new Set<string>(mintedAccountIds);

    const unallocated = await MoneriumFiatDeposit.findAll({
      attributes: ["accountId"],
      group: ["account_id"],
      where: { allocatedExecutionId: null, status: MoneriumFiatDepositStatus.Minted }
    });
    for (const row of unallocated) {
      candidates.add(row.accountId);
    }

    const balanceCheckAccounts = await MoneriumAccount.findAll({
      where: {
        dormantSince: null,
        // Sequelize renders an empty NOT IN as NOT IN (NULL), which matches nothing.
        ...(candidates.size > 0 ? { id: { [Op.notIn]: [...candidates] } } : {}),
        status: { [Op.in]: [MoneriumAccountStatus.Onboarding, MoneriumAccountStatus.Active] }
      }
    });
    for (const account of balanceCheckAccounts) {
      try {
        const forwarder = account.forwarderAddress as Address;
        const { eure } = await getForwarderImmutables(forwarder);
        const balance = await getPublicClient().readContract({
          abi: erc20Abi,
          address: eure,
          args: [forwarder],
          functionName: "balanceOf"
        });
        if (balance > 0n) {
          candidates.add(account.id);
        }
      } catch (error) {
        logger.warn(`monerium-b2b: balance check failed for account ${account.id}:`, error);
      }
    }

    return [...candidates];
  }
}

export default MoneriumB2bWorker;
