import { Op } from "sequelize";
import { Address, encodePacked, Hex, parseAbi } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import { erc20Abi, factoryAbi, forwarderAbi, getChainId, getForwarderImmutables, getPublicClient } from "./chain";
import { getProfileAddresses, listIbans } from "./whitelabel-client";

/**
 * Monitoring pass for the Monerium B2B onramp (implementation plan D3 / phase 3), run
 * from the keeper worker. Four read-only monitors, alerting via the standard logger:
 *
 * 1. Executable-depth check (main PRD §7.4, T6 follow-up): QuoterV2 static quote on the
 *    pinned EURe->EURC->USDC path at perSwapCap and minSwapAmount sizes vs the
 *    Chainlink EUR/USD rate. Impact above SLIPPAGE_BPS at minSwapAmount size is the
 *    PAUSE THRESHOLD (error-level -> engage guardian pause per the incident runbook);
 *    at perSwapCap size it is an early warning. Mainnet-only (QuoterV2 pin).
 * 2. Stranded-balance monitor: forwarders whose on-chain stranding marker (R03) has
 *    been armed for more than STRANDED_WARN_MS warn; past TRIGGER_DELAY (the
 *    permissionless-trigger delay, registry P4) they error — the keeper should have
 *    converted long before either.
 * 3. Association monitor (S1 detective control, trust model in the b2b-variant doc):
 *    re-reads the linked-address and IBAN state from the Monerium API per active
 *    account and alerts on ANY divergence from the DB record (IBAN moved, new address
 *    linked). Vortex holds the whitelabel credentials, so association changes cannot
 *    be prevented client-side — only detected.
 * 4. Config reconciliation (manifest re-verification, R07): re-reads per-clone config
 *    and clone bytecode. destination/fallbackAddress changes are owner-authorized by
 *    construction (`onlyFallback` in the contract) — they are reconciled into the DB
 *    and logged, not alarmed. feeBps/bytecode/registration drift is an incident.
 *
 * None of these monitors hold keys or send transactions; they are detection-only.
 */

/** Uniswap V3 QuoterV2 on Ethereum mainnet (the pinned quoting contract, PRD §7.4). */
export const MAINNET_QUOTER_V2: Address = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

/** Stranding marker armed longer than this warns (the keeper converts within minutes normally). */
export const STRANDED_WARN_MS = 12 * 60 * 60 * 1000;

/** Full monitoring pass at most this often (the worker cycles every minute). */
const MONITORING_INTERVAL_MS = 30 * 60_000;

const quoterV2Abi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)"
]);

const chainlinkAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
]);

// Read-only getters beyond the keeper ABI surface in ./chain.ts.
const forwarderMonitoringAbi = parseAbi([
  "function destination() view returns (address)",
  "function fallbackAddress() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function EURC() view returns (address)",
  "function USDC() view returns (address)",
  "function ORACLE() view returns (address)",
  "function ORACLE_DECIMALS() view returns (uint8)",
  "function SLIPPAGE_BPS() view returns (uint16)",
  "function TRIGGER_DELAY() view returns (uint256)",
  "function POOL_FEE_EURE_EURC() view returns (uint24)",
  "function POOL_FEE_EURC_USDC() view returns (uint24)"
]);

const factoryMonitoringAbi = parseAbi([
  "function implementation() view returns (address)",
  "function isForwarder(address forwarder) view returns (bool)"
]);

// ------------------------------------------------------------------ pure logic

/**
 * Price impact of an executable quote vs the Chainlink EUR/USD rate, in bps (floored;
 * negative when the quote beats the oracle). Same scaling as VortexForwarder._minOut
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
  feeBps: number;
}

export interface ConfigDriftResult {
  /** Immutable-config violations — should be impossible; alarm, never reconcile. */
  errors: string[];
  /** destination/fallbackAddress drift: owner-authorized by construction (R07) — reconcile the DB. */
  ownerAuthorizedUpdates: Partial<Pick<ForwarderConfigRecord, "destination" | "fallbackAddress">>;
}

/**
 * Classifies drift between the DB config record and on-chain clone state.
 * destination/fallbackAddress are mutable ONLY by the client's fallbackAddress
 * (`onlyFallback`), so any change there is an expected owner-authorized transition
 * (re-review R07); feeBps is immutable post-init, so a change there is an incident.
 */
export function detectConfigDrift(db: ForwarderConfigRecord, onchain: ForwarderConfigRecord): ConfigDriftResult {
  const result: ConfigDriftResult = { errors: [], ownerAuthorizedUpdates: {} };
  if (db.feeBps !== onchain.feeBps) {
    result.errors.push(`immutable feeBps mismatch: db=${db.feeBps} chain=${onchain.feeBps}`);
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
 * perSwapCap on the pinned path vs Chainlink. Runs only against Ethereum mainnet —
 * MAINNET_QUOTER_V2 is a mainnet pin.
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
  const forwarder = accounts[0].forwarderAddress as Address;
  const { eure, factory } = await getForwarderImmutables(forwarder);
  const [eurc, usdc, oracle, oracleDecimals, slippageBps, poolFeeEureEurc, poolFeeEurcUsdc, minSwapAmount, perSwapCap] =
    await Promise.all([
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "EURC" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "USDC" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "ORACLE" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "ORACLE_DECIMALS" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "SLIPPAGE_BPS" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "POOL_FEE_EURE_EURC" }),
      client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "POOL_FEE_EURC_USDC" }),
      client.readContract({ abi: factoryAbi, address: factory, functionName: "minSwapAmount" }),
      client.readContract({ abi: factoryAbi, address: factory, functionName: "perSwapCap" })
    ]);

  const [, answer, , updatedAt] = await client.readContract({
    abi: chainlinkAbi,
    address: oracle,
    functionName: "latestRoundData"
  });
  if (answer <= 0n) {
    logger.error(`monerium-b2b: depth check aborted — Chainlink EUR/USD answered ${answer}`);
    return;
  }

  const path = encodePacked(
    ["address", "uint24", "address", "uint24", "address"],
    [eure, poolFeeEureEurc, eurc, poolFeeEurcUsdc, usdc]
  );
  const quote = async (amountIn: bigint): Promise<bigint> => {
    const { result } = await client.simulateContract({
      abi: quoterV2Abi,
      address: MAINNET_QUOTER_V2,
      args: [path, amountIn],
      functionName: "quoteExactInput"
    });
    return result[0];
  };

  const [minOut, capOut] = await Promise.all([quote(minSwapAmount), quote(perSwapCap)]);
  const minImpactBps = computeQuoteImpactBps(minSwapAmount, minOut, answer, Number(oracleDecimals));
  const capImpactBps = computeQuoteImpactBps(perSwapCap, capOut, answer, Number(oracleDecimals));
  const detail =
    `oracle=${answer} (updatedAt=${updatedAt}), minSwapAmount=${minSwapAmount} -> ${minOut} (${minImpactBps} bps), ` +
    `perSwapCap=${perSwapCap} -> ${capOut} (${capImpactBps} bps), SLIPPAGE_BPS=${slippageBps}`;

  if (minImpactBps > slippageBps) {
    // PAUSE THRESHOLD (PRD §7.4): even minimum-size swaps would revert on minOut.
    logger.error(
      "monerium-b2b: PAUSE THRESHOLD — quote impact at minSwapAmount exceeds SLIPPAGE_BPS; engage guardian pause per " +
        `docs/runbooks/monerium-b2b-incident.md. ${detail}`
    );
  } else if (capImpactBps > slippageBps) {
    logger.warn(`monerium-b2b: executable depth below perSwapCap — cap-sized swaps would revert on minOut. ${detail}`);
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
  const [minSwapFloor, triggerDelay] = await Promise.all([
    client.readContract({ abi: factoryAbi, address: factory, functionName: "MIN_SWAP_FLOOR" }),
    client.readContract({
      abi: forwarderMonitoringAbi,
      address: accounts[0].forwarderAddress as Address,
      functionName: "TRIGGER_DELAY"
    })
  ]);

  for (const account of accounts) {
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
    const hours = Math.floor((now - Number(strandedSince) * 1000) / 3_600_000);
    const message =
      `monerium-b2b: stranded EURe on forwarder ${forwarder} (account ${account.id}): balance=${balance}, ` +
      `marker armed ${hours}h ago${severity === "error" ? " — past TRIGGER_DELAY, permissionless trigger is live" : ""}`;
    if (severity === "error") {
      logger.error(message);
    } else {
      logger.warn(message);
    }
  }
}

/**
 * Association monitor (S1 detective control): compares the Monerium-side linked
 * addresses + IBAN state per active account against the DB record and alerts on ANY
 * change. Error-level: an unexplained association change is an incident trigger
 * (docs/runbooks/monerium-b2b-incident.md).
 */
export async function runAssociationMonitor(): Promise<void> {
  const accounts = await monitoredAccounts([MoneriumAccountStatus.Active]);
  if (accounts.length === 0) {
    return;
  }
  const ibans = (await listIbans()).map(entry => ({ address: entry.address, iban: entry.iban }));
  for (const account of accounts) {
    try {
      const profileAddresses = await getProfileAddresses(account.profileId);
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
  const implementationByFactory = new Map<string, Address>();

  for (const account of accounts) {
    try {
      const forwarder = account.forwarderAddress as Address;
      const { factory } = await getForwarderImmutables(forwarder);
      let implementation = implementationByFactory.get(factory.toLowerCase());
      if (!implementation) {
        implementation = await client.readContract({
          abi: factoryMonitoringAbi,
          address: factory,
          functionName: "implementation"
        });
        implementationByFactory.set(factory.toLowerCase(), implementation);
      }

      const [destination, fallbackAddress, feeBps, isForwarder, code] = await Promise.all([
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "destination" }),
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "fallbackAddress" }),
        client.readContract({ abi: forwarderMonitoringAbi, address: forwarder, functionName: "feeBps" }),
        client.readContract({ abi: factoryMonitoringAbi, address: factory, args: [forwarder], functionName: "isForwarder" }),
        client.getCode({ address: forwarder })
      ]);

      if (!isForwarder) {
        logger.error(`monerium-b2b: forwarder ${forwarder} (account ${account.id}) is not registered on factory ${factory}`);
      }
      if ((code ?? "0x").toLowerCase() !== eip1167RuntimeCode(implementation).toLowerCase()) {
        logger.error(
          `monerium-b2b: forwarder ${forwarder} (account ${account.id}) bytecode is not the EIP-1167 clone of ${implementation}`
        );
      }

      const drift = detectConfigDrift(
        { destination: account.destination, fallbackAddress: account.fallbackAddress, feeBps: account.feeBps },
        { destination, fallbackAddress, feeBps: Number(feeBps) }
      );
      for (const error of drift.errors) {
        logger.error(`monerium-b2b: config violation on forwarder ${forwarder} (account ${account.id}): ${error}`);
      }
      if (Object.keys(drift.ownerAuthorizedUpdates).length > 0) {
        // Owner-authorized transition (R07): only the client's fallbackAddress can
        // change these on-chain — reconcile, do not alarm.
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
  if (config.moneriumB2b.rpcUrl) {
    await guarded("executable-depth check", runExecutableDepthCheck);
    await guarded("stranded-balance monitor", () => runStrandedBalanceMonitor(now));
    await guarded("config reconciliation", runConfigReconciliation);
  }
  if (config.moneriumB2b.clientId && config.moneriumB2b.clientSecret) {
    await guarded("association monitor", runAssociationMonitor);
  }
}
