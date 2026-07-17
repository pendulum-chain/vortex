import { Address } from "viem";
import logger from "../../../config/logger";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import { forwarderAbi, getGuardianWalletClient, getPublicClient } from "./chain";

/**
 * Dormancy gate (plan §3, R05): accounts with no successful forward for the dormancy
 * window get a protective per-clone guardian pause. The pause can never move funds or
 * block the client's fallback paths (contract invariant, plan §2.2); account status
 * stays `active` — the pause lives on-chain, `dormant_since` records the detection.
 *
 * Un-pause is MANUAL for now: guardian ops call setGuardianPaused(false) after the
 * partner re-confirms the client relationship — re-confirmation mechanics are a
 * partner-agreement item (deferred-decisions registry B5).
 */

/** Dormancy pause window — registry P5 (docs/prd/monerium-onramp-deferred-decisions.md). */
export const DORMANCY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export interface DormancyAccountFields {
  createdAt: Date;
  dormantSince: Date | null;
  status: MoneriumAccountStatus;
}

/**
 * An account is a dormancy candidate iff it is active, not already flagged, and its
 * last confirmed conversion (or, for never-converted accounts, its creation) is at
 * least the dormancy window in the past.
 */
export function isDormancyCandidate(
  account: DormancyAccountFields,
  lastConfirmedAt: Date | null,
  now: Date = new Date()
): boolean {
  if (account.status !== MoneriumAccountStatus.Active || account.dormantSince !== null) {
    return false;
  }
  const anchor = lastConfirmedAt ?? account.createdAt;
  return now.getTime() - anchor.getTime() >= DORMANCY_WINDOW_MS;
}

async function pauseDormantAccount(account: MoneriumAccount, now: Date): Promise<void> {
  const guardian = getGuardianWalletClient();
  if (!guardian) {
    // Log-only mode (MONERIUM_B2B_GUARDIAN_PRIVATE_KEY unset): record the detection so
    // it is not re-alerted every cycle, but state clearly that no on-chain pause exists.
    logger.warn(
      `monerium-b2b: account ${account.id} (forwarder ${account.forwarderAddress}) is dormant; ` +
        "guardian key not configured — NOT pausing on-chain (log-only mode)"
    );
    await account.update({ dormantSince: now });
    return;
  }

  const client = getPublicClient();
  const forwarder = account.forwarderAddress as Address;
  const { request } = await client.simulateContract({
    abi: forwarderAbi,
    account: guardian.account,
    address: forwarder,
    args: [true],
    functionName: "setGuardianPaused"
  });
  const hash = await guardian.writeContract({ ...request, chain: null });
  await client.waitForTransactionReceipt({ hash });
  await account.update({ dormantSince: now });
  logger.info(`monerium-b2b: dormancy pause set for account ${account.id} (forwarder ${forwarder}, tx ${hash})`);
}

/** Runs one dormancy-gate pass over all active, not-yet-flagged accounts. */
export async function runDormancyGate(now: Date = new Date()): Promise<void> {
  const accounts = await MoneriumAccount.findAll({
    where: { dormantSince: null, status: MoneriumAccountStatus.Active }
  });
  for (const account of accounts) {
    try {
      const lastConfirmed = await MoneriumConversionExecution.findOne({
        order: [["created_at", "DESC"]],
        where: { accountId: account.id, status: MoneriumConversionExecutionStatus.Confirmed }
      });
      if (isDormancyCandidate(account, lastConfirmed?.createdAt ?? null, now)) {
        await pauseDormantAccount(account, now);
      }
    } catch (error) {
      logger.error(`monerium-b2b: dormancy gate failed for account ${account.id}:`, error);
    }
  }
}
