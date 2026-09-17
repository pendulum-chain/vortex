import { Op } from "sequelize";
import { Address, Hex, parseAbi } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import {
  chainlinkAbi,
  erc20Abi,
  factoryAbi,
  forwarderAbi,
  getChainId,
  getForwarderImmutables,
  getPublicClient,
  moneriumChainForChainId,
  quoteRouteOutput,
  readEnabledRoutes,
  readSubsidyVaultState,
  SubsidyVaultState
} from "./chain";
import { getProfileAddresses, isWhitelabelConfigured, listIbans } from "./monerium-api";
import { COINBASE_REFERENCE_PRODUCT, classifyReferenceVenue, fetchCoinbaseProductStatus } from "./reference-rate";

/**
 * Monitoring pass for the Monerium B2B onramp (implementation plan D3 / phase 3), run
 * from the keeper worker. Five read-only monitors, alerting via the standard logger:
 *
 * 1. Executable-depth check (main PRD §7.4, T6 follow-up): QuoterV2 static quotes on
 *    every enabled factory route at perSwapCap and minSwapAmount sizes vs the Chainlink
 *    EUR/USD rate. Raw impact of the best route above SLIPPAGE_BPS at minSwapAmount size
 *    means every keeper swap draws a subsidy and the permissionless path would revert
 *    (error-level DEPTH BELOW FLOOR line, triage per the runbook); at perSwapCap size it
 *    is an early warning. Mainnet-only (QuoterV2 pin).
 * 2. Stranded-balance monitor: forwarders whose on-chain stranding marker (R03) has
 *    been armed for more than STRANDED_WARN_MS warn; past TRIGGER_DELAY (the
 *    permissionless-trigger delay, registry P4) they error — the keeper should have
 *    converted long before either — and within SWEEP_IMMINENT_MS of SWEEP_DELAY the
 *    error says so: the dead-man sweep to the fallback is about to become possible.
 * 5. Subsidy-vault monitor: balance, daily budget and pause state of the shared vault
 *    (docs/architecture-monerium-b2b-onramp.md, fees section); a vault that cannot cover a
 *    below-floor swap makes the keeper defer, so runway problems surface here first.
 * 3. Association monitor (S1 detective control, trust model in the b2b-variant doc):
 *    re-reads the linked-address and IBAN state from the Monerium API per active
 *    account and alerts on ANY divergence from the DB record (IBAN moved, new address
 *    linked). Vortex holds the whitelabel credentials, so association changes cannot
 *    be prevented client-side — only detected.
 * 4. Config reconciliation (manifest re-verification, R07): re-reads per-clone config
 *    and clone bytecode. destination/fallbackAddress changes are owner-authorized by
 *    construction (`onlyFallback` in the contract) — they are reconciled into the DB
 *    and logged, not alarmed, as are guardian fee-policy changes (P11); bytecode or
 *    registration drift is an incident.
 * 6. Reference-venue monitor: the Coinbase product the reference VWAP reads. A delisted
 *    or halted product keeps answering the candles endpoint with stale data, so every
 *    keeper swap would defer silently; its status is probed instead of assumed.
 *
 * None of these monitors hold keys or send transactions; they are detection-only.
 */

/** Stranding marker armed longer than this warns (the keeper converts within minutes normally). */
export const STRANDED_WARN_MS = 12 * 60 * 60 * 1000;

/** Inside this window before SWEEP_DELAY the stranding error names the imminent sweep. */
export const SWEEP_IMMINENT_MS = 2 * 24 * 60 * 60 * 1000;

/** Full monitoring pass at most this often (the worker cycles every minute). */
const MONITORING_INTERVAL_MS = 30 * 60_000;

// Read-only getters beyond the keeper ABI surface in ./chain.ts.
const forwarderMonitoringAbi = parseAbi([
  "function destination() view returns (address)",
  "function fallbackAddress() view returns (address)",
  "function targetPpm() view returns (uint32)",
  "function floorPpm() view returns (uint32)",
  "function TRIGGER_DELAY() view returns (uint256)",
  "function SWEEP_DELAY() view returns (uint256)"
]);

const factoryMonitoringAbi = parseAbi([
  "function implementation() view returns (address)",
  "function isForwarder(address forwarder) view returns (bool)"
]);

// ------------------------------------------------------------------ pure logic

/**
 * Price impact of an executable quote vs the Chainlink EUR/USD rate, in bps (floored;
 * negative when the quote beats the oracle). Same scaling as VortexForwarder._floorOut
 * without the slippage haircut: EURe 18 dp in, USDC 6 dp out.
 */
export function computeQuoteImpactBps(
  amountInRaw: bigint,
  quotedOutRaw: bigint,
  oracleAnswer: bigint,
  oracleDecimals: number
): number {
  const expectedOut = (amountInRaw * oracleAnswer) / 10n ** BigInt(12 + oracleDecimals);
  if (expectedOut <= 0n) {
    return 0;
  }
  return Number(((expectedOut - quotedOutRaw) * 10_000n) / expectedOut);
}

export type DepthSeverity = "error" | "ok" | "warn";

/**
 * Verdict of the executable-depth check from the raw quote impact vs Chainlink at the
 * two swap sizes. Settlement enforces SLIPPAGE_BPS on the client's NET, so a raw impact
 * above it does not by itself revert a keeper swap: the vault covers the shortfall
 * below the floor band up to its per-swap cap and the keeper defers beyond that
 * (`projectSwap`). It does mean every keeper swap of that size draws a subsidy and the
 * unsubsidized permissionless path would revert — a market condition to investigate,
 * not a pause trigger on its own.
 */
export function classifyExecutableDepth(
  minImpactBps: number,
  capImpactBps: number,
  slippageBps: number
): { reason: string; severity: DepthSeverity } {
  if (minImpactBps > slippageBps) {
    return {
      reason:
        "raw quote impact at minSwapAmount exceeds SLIPPAGE_BPS on every route: every keeper swap needs a vault " +
        "subsidy (deferring once the shortfall exceeds the per-swap cap) and the permissionless path would revert",
      severity: "error"
    };
  }
  if (capImpactBps > slippageBps) {
    return {
      reason: "raw quote impact at perSwapCap exceeds SLIPPAGE_BPS on the best route: cap-sized swaps need a vault subsidy",
      severity: "warn"
    };
  }
  return { reason: "ok", severity: "ok" };
}

export type StrandingSeverity = "error" | "ok" | "warn";

/**
 * Severity of an armed stranding marker (R03): older than TRIGGER_DELAY (the
 * permissionless-trigger delay) is an error; older than STRANDED_WARN_MS a warning.
 */
export function classifyStranding(strandedSinceSec: bigint, triggerDelaySec: bigint, nowMs: number): StrandingSeverity {
  if (strandedSinceSec === 0n) {
    return "ok";
  }
  const armedMs = nowMs - Number(strandedSinceSec) * 1000;
  if (armedMs >= Number(triggerDelaySec) * 1000) {
    return "error";
  }
  if (armedMs >= STRANDED_WARN_MS) {
    return "warn";
  }
  return "ok";
}

export type VaultRunwaySeverity = "error" | "ok" | "warn";

/**
 * Runway of the shared subsidy vault. Paused or empty is an error (every below-floor
 * swap defers); less than one day of budget on hand, or today's budget already spent,
 * is a warning worth a refill before clients notice.
 */
export function classifyVaultRunway(state: Pick<SubsidyVaultState, "balance" | "dailyBudget" | "paused" | "spentToday">): {
  reason: string;
  severity: VaultRunwaySeverity;
} {
  if (state.paused) {
    return { reason: "vault is paused", severity: "error" };
  }
  if (state.balance === 0n) {
    return { reason: "vault is empty", severity: "error" };
  }
  if (state.balance < state.dailyBudget) {
    return { reason: "balance is below one day of budget", severity: "warn" };
  }
  if (state.spentToday >= state.dailyBudget) {
    return { reason: "today's budget is exhausted", severity: "warn" };
  }
  return { reason: "ok", severity: "ok" };
}

export interface AssociationDbRecord {
  forwarderAddress: string;
  iban: string | null;
}

export interface LiveAssociationState {
  /** All IBANs visible to the partner context: { iban, address } pairs. */
  ibans: { address: string; iban: string }[];
  /** Addresses linked to this account's profile. */
  profileAddresses: string[];
}

export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Detects ANY divergence between the DB association record and the live Monerium
 * state (S1/PATCH-ibans detective control): forwarder unlinked, extra addresses on
 * the profile, the IBAN moved to another address, or an IBAN we did not record.
 */
export function diffAssociation(db: AssociationDbRecord, live: LiveAssociationState): string[] {
  const changes: string[] = [];
  const forwarder = db.forwarderAddress.toLowerCase();

  if (!live.profileAddresses.some(address => address.toLowerCase() === forwarder)) {
    changes.push(`forwarder ${db.forwarderAddress} is no longer linked to the profile`);
  }
  for (const address of live.profileAddresses) {
    if (address.toLowerCase() !== forwarder) {
      changes.push(`unexpected address linked to the profile: ${address}`);
    }
  }

  const dbIban = db.iban ? normalizeIban(db.iban) : null;
  if (dbIban) {
    const entry = live.ibans.find(candidate => normalizeIban(candidate.iban) === dbIban);
    if (!entry) {
      changes.push(`IBAN ${db.iban} no longer exists at Monerium`);
    } else if (entry.address.toLowerCase() !== forwarder) {
      changes.push(`IBAN ${db.iban} moved to address ${entry.address}`);
    }
  }
  for (const entry of live.ibans) {
    if (entry.address.toLowerCase() === forwarder && normalizeIban(entry.iban) !== dbIban) {
      changes.push(`unrecorded IBAN issued for the forwarder: ${entry.iban}`);
    }
  }
  return changes;
}

export interface ForwarderConfigRecord {
  destination: string;
  fallbackAddress: string;
  floorPpm: number;
  targetPpm: number;
}

export interface ConfigDriftResult {
  /** Immutable-config violations — should be impossible; alarm, never reconcile. */
  errors: string[];
  /** Authorized on-chain transitions — reconcile the DB: destination/fallbackAddress
   *  change only via the client's own key (R07), the fee policy only via the guardian's
   *  timelocked setter (P11); both leave an on-chain event trail. */
  ownerAuthorizedUpdates: Partial<ForwarderConfigRecord>;
}

/**
 * Classifies drift between the DB config record and on-chain clone state.
 * destination/fallbackAddress are mutable ONLY by the client's fallbackAddress
 * (`onlyFallback`) and the fee policy ONLY by the guardian's timelocked setter (P11), so any
 * change in those is an expected authorized transition to reconcile; everything else
 * (bytecode, registration) is immutable and a change there is an incident.
 */
export function detectConfigDrift(db: ForwarderConfigRecord, onchain: ForwarderConfigRecord): ConfigDriftResult {
  const result: ConfigDriftResult = { errors: [], ownerAuthorizedUpdates: {} };
  if (db.targetPpm !== onchain.targetPpm) {
    result.ownerAuthorizedUpdates.targetPpm = onchain.targetPpm;
  }
  if (db.floorPpm !== onchain.floorPpm) {
    result.ownerAuthorizedUpdates.floorPpm = onchain.floorPpm;
  }
  if (db.destination.toLowerCase() !== onchain.destination.toLowerCase()) {
    result.ownerAuthorizedUpdates.destination = onchain.destination;
  }
  if (db.fallbackAddress.toLowerCase() !== onchain.fallbackAddress.toLowerCase()) {
    result.ownerAuthorizedUpdates.fallbackAddress = onchain.fallbackAddress;
  }
  return result;
}

/** Runtime code of a standard EIP-1167 minimal proxy pointing at `implementation`. */
export function eip1167RuntimeCode(implementation: Address): Hex {
  return `0x363d3d373d3d3d363d73${implementation.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3` as Hex;
}

// ------------------------------------------------------------------ monitor runners

async function monitoredAccounts(statuses: MoneriumAccountStatus[]): Promise<MoneriumAccount[]> {
  return MoneriumAccount.findAll({ where: { status: { [Op.in]: statuses } } });
}

/**
 * Executable-depth check (PRD §7.4): QuoterV2 static quotes at minSwapAmount and
 * perSwapCap on every enabled factory route vs Chainlink; the best route decides.
 * Runs only against Ethereum mainnet — MAINNET_QUOTER_V2 is a mainnet pin.
 */
export async function runExecutableDepthCheck(): Promise<void> {
  if ((await getChainId()) !== 1) {
    return;
  }
  const accounts = await monitoredAccounts([MoneriumAccountStatus.Onboarding, MoneriumAccountStatus.Active]);
  if (accounts.length === 0) {
    return;
  }
  const client = getPublicClient();
  const { factory, oracle, oracleDecimals, slippageBps } = await getForwarderImmutables(
    accounts[0].forwarderAddress as Address
  );
  const [minSwapAmount, perSwapCap, routes] = await Promise.all([
    client.readContract({ abi: factoryAbi, address: factory, functionName: "minSwapAmount" }),
    client.readContract({ abi: factoryAbi, address: factory, functionName: "perSwapCap" }),
    readEnabledRoutes(factory)
  ]);
  if (routes.length === 0) {
    logger.error("monerium-b2b: depth check aborted — the factory has no enabled swap route");
    return;
  }

  const [, answer, , updatedAt] = await client.readContract({
    abi: chainlinkAbi,
    address: oracle,
    functionName: "latestRoundData"
  });
  if (answer <= 0n) {
    logger.error(`monerium-b2b: depth check aborted — Chainlink EUR/USD answered ${answer}`);
    return;
  }

  const quoted: Array<{ capImpactBps: number; index: number; minImpactBps: number }> = [];
  for (const route of routes) {
    try {
      const [minOut, capOut] = await Promise.all([
        quoteRouteOutput(route.path, minSwapAmount),
        quoteRouteOutput(route.path, perSwapCap)
      ]);
      quoted.push({
        capImpactBps: computeQuoteImpactBps(perSwapCap, capOut, answer, oracleDecimals),
        index: route.index,
        minImpactBps: computeQuoteImpactBps(minSwapAmount, minOut, answer, oracleDecimals)
      });
    } catch (error) {
      logger.warn(`monerium-b2b: depth check could not quote route ${route.index}:`, error);
    }
  }
  if (quoted.length === 0) {
    logger.error("monerium-b2b: depth check aborted — no enabled swap route could be quoted");
    return;
  }
  const best = quoted.reduce((leader, route) => (route.minImpactBps < leader.minImpactBps ? route : leader));
  const detail =
    `oracle=${answer} (updatedAt=${updatedAt}), SLIPPAGE_BPS=${slippageBps}, best route ${best.index}; per route: ` +
    quoted.map(route => `#${route.index} min=${route.minImpactBps}bps cap=${route.capImpactBps}bps`).join(", ");

  const verdict = classifyExecutableDepth(best.minImpactBps, best.capImpactBps, slippageBps);
  if (verdict.severity === "error") {
    logger.error(
      `monerium-b2b: DEPTH BELOW FLOOR — ${verdict.reason}; triage per docs/operations-monerium-b2b-runbook.md §3. ${detail}`
    );
  } else if (verdict.severity === "warn") {
    logger.warn(`monerium-b2b: ${verdict.reason}. ${detail}`);
  } else {
    logger.info(`monerium-b2b: depth check ok. ${detail}`);
  }
}

/** Stranded-balance monitor: armed R03 markers older than 12h warn, older than TRIGGER_DELAY error. */
export async function runStrandedBalanceMonitor(now: number = Date.now()): Promise<void> {
  const accounts = await monitoredAccounts([
    MoneriumAccountStatus.Onboarding,
    MoneriumAccountStatus.Active,
    MoneriumAccountStatus.Suspended
  ]);
  if (accounts.length === 0) {
    return;
  }
  const client = getPublicClient();
  const { factory } = await getForwarderImmutables(accounts[0].forwarderAddress as Address);
  const [minSwapFloor, triggerDelay, sweepDelay] = await Promise.all([
    client.readContract({ abi: factoryAbi, address: factory, functionName: "MIN_SWAP_FLOOR" }),
    client.readContract({
      abi: forwarderMonitoringAbi,
      address: accounts[0].forwarderAddress as Address,
      functionName: "TRIGGER_DELAY"
    }),
    client.readContract({
      abi: forwarderMonitoringAbi,
      address: accounts[0].forwarderAddress as Address,
      functionName: "SWEEP_DELAY"
    })
  ]);

  for (const account of accounts) {
    try {
      const forwarder = account.forwarderAddress as Address;
      const { eure } = await getForwarderImmutables(forwarder);
      const [balance, strandedSince] = await Promise.all([
        client.readContract({ abi: erc20Abi, address: eure, args: [forwarder], functionName: "balanceOf" }),
        client.readContract({ abi: forwarderAbi, address: forwarder, functionName: "strandedSince" })
      ]);
      if (balance < minSwapFloor) {
        continue;
      }
      const severity = classifyStranding(strandedSince, triggerDelay, now);
      if (severity === "ok") {
        continue;
      }
      const armedMs = now - Number(strandedSince) * 1000;
      const hours = Math.floor(armedMs / 3_600_000);
      const sweepInMs = Number(sweepDelay) * 1000 - armedMs;
      const sweepNote =
        sweepInMs <= SWEEP_IMMINENT_MS
          ? `; dead-man sweep to the fallback ${sweepInMs <= 0 ? "is live" : `possible in ${Math.ceil(sweepInMs / 3_600_000)}h`}`
          : "";
      const message =
        `monerium-b2b: stranded EURe on forwarder ${forwarder} (account ${account.id}): balance=${balance}, ` +
        `marker armed ${hours}h ago${severity === "error" ? " — past TRIGGER_DELAY, permissionless trigger is live" : ""}${sweepNote}`;
      if (severity === "error") {
        logger.error(message);
      } else {
        logger.warn(message);
      }
    } catch (error) {
      // Per-account isolation like the sibling monitors: one failing read must not
      // hide stranding on every other account.
      logger.warn(`monerium-b2b: stranded-balance check failed for account ${account.id}:`, error);
    }
  }
}

/**
 * Association monitor (S1 detective control): compares the Monerium-side linked
 * addresses + IBAN state per active account against the DB record and alerts on ANY
 * change. Error-level: an unexplained association change is an incident trigger
 * (docs/operations-monerium-b2b-runbook.md).
 */
export async function runAssociationMonitor(): Promise<void> {
  const accounts = await monitoredAccounts([MoneriumAccountStatus.Active]);
  if (accounts.length === 0) {
    return;
  }
  const chainId = await getChainId();
  const chainName = moneriumChainForChainId(chainId);
  if (!chainName) {
    logger.error(`monerium-b2b: association monitor has no Monerium chain name for chain id ${chainId}`);
    return;
  }
  const allIbans = await listIbans();
  for (const account of accounts) {
    try {
      const ibans = allIbans
        .filter(entry => entry.chain === chainName && entry.profile === account.profileId)
        .map(entry => ({ address: entry.address, iban: entry.iban }));
      const profileAddresses = await getProfileAddresses(account.profileId, chainName);
      const changes = diffAssociation(
        { forwarderAddress: account.forwarderAddress, iban: account.iban },
        { ibans, profileAddresses }
      );
      if (changes.length > 0) {
        logger.error(
          `monerium-b2b: ASSOCIATION CHANGE for account ${account.id} (profile ${account.profileId}): ${changes.join("; ")}`
        );
      }
    } catch (error) {
      logger.warn(`monerium-b2b: association monitor failed for account ${account.id}:`, error);
    }
  }
}

/**
 * Config reconciliation (manifest re-verification pass, R07): re-checks per-clone
 * state against the DB. Owner-authorized destination/fallback changes are reconciled
 * (DB update + configVersion bump), immutable violations are alarmed.
 */
export async function runConfigReconciliation(): Promise<void> {
  const accounts = await monitoredAccounts([MoneriumAccountStatus.Onboarding, MoneriumAccountStatus.Active]);
  if (accounts.length === 0) {
    return;
  }
  const client = getPublicClient();
  const trustedFactory = config.moneriumB2b.forwarderFactoryAddress;
  if (!trustedFactory) {
    logger.error("monerium-b2b: config reconciliation skipped — trusted forwarder factory is not configured");
    return;
  }
  const implementationByFactory = new Map<string, Address>();

  for (const account of accounts) {
    try {
      const forwarder = account.forwarderAddress as Address;
      const { factory } = await getForwarderImmutables(forwarder);
      if (factory.toLowerCase() !== trustedFactory.toLowerCase()) {
        logger.error(
          `monerium-b2b: forwarder ${forwarder} (account ${account.id}) reports untrusted factory ${factory}; ` +
            `expected ${trustedFactory}`
        );
        continue;
      }
      const trustedFactoryAddress = trustedFactory as Address;
      let implementation = implementationByFactory.get(trustedFactory.toLowerCase());
      if (!implementation) {
        implementation = await client.readContract({
          abi: factoryMonitoringAbi,
          address: trustedFactoryAddress,
          functionName: "implementation"
        });
        implementationByFactory.set(trustedFactory.toLowerCase(), implementation);
      }

      const [destination, fallbackAddress, targetPpm, floorPpm, isForwarder, code] = await Promise.all([
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "destination" }),
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "fallbackAddress" }),
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "targetPpm" }),
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "floorPpm" }),
        client.readContract({
          abi: factoryMonitoringAbi,
          address: trustedFactoryAddress,
          args: [forwarder],
          functionName: "isForwarder"
        }),
        client.getCode({ address: forwarder })
      ]);

      if (!isForwarder) {
        logger.error(
          `monerium-b2b: forwarder ${forwarder} (account ${account.id}) is not registered on trusted factory ${trustedFactory}`
        );
      }
      if ((code ?? "0x").toLowerCase() !== eip1167RuntimeCode(implementation).toLowerCase()) {
        logger.error(
          `monerium-b2b: forwarder ${forwarder} (account ${account.id}) bytecode is not the EIP-1167 clone of ${implementation}`
        );
      }

      const drift = detectConfigDrift(
        {
          destination: account.destination,
          fallbackAddress: account.fallbackAddress,
          floorPpm: account.floorPpm,
          targetPpm: account.targetPpm
        },
        { destination, fallbackAddress, floorPpm: Number(floorPpm), targetPpm: Number(targetPpm) }
      );
      for (const error of drift.errors) {
        logger.error(`monerium-b2b: config violation on forwarder ${forwarder} (account ${account.id}): ${error}`);
      }
      if (Object.keys(drift.ownerAuthorizedUpdates).length > 0) {
        // Authorized transition: destination/fallback change only via the client's
        // fallbackAddress (R07), the fee policy only via the guardian's timelocked setter
        // (P11) — reconcile, do not alarm.
        await account.update({ ...drift.ownerAuthorizedUpdates, configVersion: account.configVersion + 1 });
        logger.warn(
          `monerium-b2b: reconciled owner-authorized config change on forwarder ${forwarder} (account ${account.id}): ` +
            `${JSON.stringify(drift.ownerAuthorizedUpdates)} (configVersion -> ${account.configVersion})`
        );
      }
    } catch (error) {
      logger.warn(`monerium-b2b: config reconciliation failed for account ${account.id}:`, error);
    }
  }
}

/** Subsidy-vault monitor: runway of the shared vault every below-floor swap depends on. */
export async function runSubsidyVaultMonitor(): Promise<void> {
  const accounts = await monitoredAccounts([MoneriumAccountStatus.Onboarding, MoneriumAccountStatus.Active]);
  if (accounts.length === 0) {
    return;
  }
  const { factory, usdc } = await getForwarderImmutables(accounts[0].forwarderAddress as Address);
  const vault = await getPublicClient().readContract({ abi: factoryAbi, address: factory, functionName: "subsidyVault" });
  const state = await readSubsidyVaultState(vault, usdc);
  if (!state) {
    logger.warn("monerium-b2b: no subsidy vault is configured on the factory — every below-floor swap will defer");
    return;
  }
  const { reason, severity } = classifyVaultRunway(state);
  const detail =
    `vault=${vault}: balance=${state.balance}, dailyBudget=${state.dailyBudget}, spentToday=${state.spentToday}, ` +
    `maxSubsidyPpm=${state.maxSubsidyPpm}, paused=${state.paused}`;
  if (severity === "error") {
    logger.error(`monerium-b2b: SUBSIDY VAULT — ${reason}; below-floor swaps are deferring. ${detail}`);
  } else if (severity === "warn") {
    logger.warn(`monerium-b2b: subsidy vault ${reason}; refill before below-floor swaps start deferring. ${detail}`);
  } else {
    logger.info(`monerium-b2b: subsidy vault ok. ${detail}`);
  }
}

/** Reference-venue monitor: a product that is not online makes every keeper swap defer. */
export async function runReferenceVenueMonitor(): Promise<void> {
  const product = await fetchCoinbaseProductStatus();
  const reason = classifyReferenceVenue(product);
  if (reason) {
    logger.error(`monerium-b2b: REFERENCE VENUE — ${reason}; every keeper swap defers until the reference source is changed`);
  } else {
    logger.info(`monerium-b2b: reference venue ok (${COINBASE_REFERENCE_PRODUCT} ${product.status})`);
  }
}

// ------------------------------------------------------------------ pass orchestration

let lastPassAt = 0;

export function resetMonitoringStateForTests(): void {
  lastPassAt = 0;
}

async function guarded(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error(`monerium-b2b: ${name} failed:`, error);
  }
}

/**
 * Runs the monitors at most every MONITORING_INTERVAL_MS. Chain monitors need only
 * MONERIUM_B2B_RPC_URL (no keys); the association monitor needs the whitelabel API
 * credentials. Each monitor is skipped, never fatal, when its config is absent.
 */
export async function runMonitoringPass(now: number = Date.now()): Promise<void> {
  if (now - lastPassAt < MONITORING_INTERVAL_MS) {
    return;
  }
  lastPassAt = now;
  await guarded("reference-venue monitor", runReferenceVenueMonitor);
  if (config.moneriumB2b.rpcUrl) {
    await guarded("executable-depth check", runExecutableDepthCheck);
    await guarded("stranded-balance monitor", () => runStrandedBalanceMonitor(now));
    await guarded("subsidy-vault monitor", runSubsidyVaultMonitor);
    await guarded("config reconciliation", runConfigReconciliation);
  }
  if (isWhitelabelConfigured()) {
    await guarded("association monitor", runAssociationMonitor);
  }
}
