import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Address, Hex } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount, { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import * as chain from "./chain";
import {
  classifyExecutableDepth,
  classifyRefundQueue,
  classifyStranding,
  classifyVaultRunway,
  computeQuoteImpactBps,
  detectConfigDrift,
  diffAssociation,
  eip1167RuntimeCode,
  normalizeIban,
  runExecutableDepthCheck,
  runStrandedBalanceMonitor
} from "./monitoring";

// Pure monitoring logic (implementation plan D3): quote-impact math against the T6
// liquidity baseline, stranding severity, association-diff detection (S1 detective
// control) and config-drift classification (R07). No chain or API involved.

const EUR = 10n ** 18n;
const USDC = 10n ** 6n;

describe("computeQuoteImpactBps", () => {
  // T6 baseline (registry, mainnet block 25553101): Chainlink 1.14410, QuoterV2
  // 10k EURe -> 1.14278 USDC/EURe. Impact vs oracle: (11441 - 11427.8) / 11441 = 11.5 bps.
  const CHAINLINK_EUR_USD = 114410000n; // 8 decimals

  it("matches the T6 baseline impact at 10k EURe", () => {
    const amountIn = 10_000n * EUR;
    const quoted = 11_427_800_000n; // 10_000 * 1.14278 in USDC 6dp
    expect(computeQuoteImpactBps(amountIn, quoted, CHAINLINK_EUR_USD, 8)).toBe(11);
  });

  it("returns 0 for a quote exactly at the oracle rate", () => {
    const amountIn = 1_000n * EUR;
    const quoted = 1_144_100_000n; // 1_000 * 1.14410
    expect(computeQuoteImpactBps(amountIn, quoted, CHAINLINK_EUR_USD, 8)).toBe(0);
  });

  it("is negative when the quote beats the oracle", () => {
    const amountIn = 1_000n * EUR;
    expect(computeQuoteImpactBps(amountIn, 1_150n * USDC, CHAINLINK_EUR_USD, 8)).toBeLessThan(0);
  });

  it("flags a pause-threshold breach above SLIPPAGE_BPS", () => {
    const amountIn = 25n * EUR; // minSwapAmount placeholder (registry P6)
    const expectedOut = (amountIn * CHAINLINK_EUR_USD) / 10n ** 20n;
    const quoted = (expectedOut * 9_850n) / 10_000n; // 150 bps impact
    expect(computeQuoteImpactBps(amountIn, quoted, CHAINLINK_EUR_USD, 8)).toBeGreaterThan(100); // > P1 SLIPPAGE_BPS
  });

  it("handles a zero-ish expected output without dividing by zero", () => {
    expect(computeQuoteImpactBps(0n, 0n, CHAINLINK_EUR_USD, 8)).toBe(0);
  });
});

describe("classifyExecutableDepth", () => {
  const SLIPPAGE_BPS = 60;

  it("is ok when the best route clears SLIPPAGE_BPS at both sizes", () => {
    expect(classifyExecutableDepth(11, 30, SLIPPAGE_BPS).severity).toBe("ok");
  });

  it("warns when only cap-sized fills would need a subsidy", () => {
    const verdict = classifyExecutableDepth(11, 75, SLIPPAGE_BPS);
    expect(verdict.severity).toBe("warn");
    expect(verdict.reason).toContain("perSwapCap");
  });

  it("errors on a subsidizable min-size impact but names the subsidy, not a pause", () => {
    // 70 bps raw impact: the vault (50 bps cap) still covers the shortfall below the
    // policy floor and the keeper executes.
    const verdict = classifyExecutableDepth(70, 90, SLIPPAGE_BPS);
    expect(verdict.severity).toBe("error");
    expect(verdict.reason).toContain("subsidy");
    expect(verdict.reason).toContain("permissionless path would revert");
    expect(verdict.reason).not.toMatch(/pause/i);
  });
});

describe("classifyStranding", () => {
  const RECOVERY_DELAY = 7_200n; // 2h, registry P3
  const TRIGGER_DELAY = 86_400n; // 24h, registry P4
  const now = 1_800_000_000_000; // fixed epoch ms

  const openedAt = (msAgo: number): bigint => BigInt(Math.floor((now - msAgo) / 1000));

  it("is ok when no batch is open", () => {
    expect(classifyStranding(0n, RECOVERY_DELAY, TRIGGER_DELAY, now)).toBe("ok");
  });

  it("is ok inside the promised window", () => {
    expect(classifyStranding(openedAt(60 * 60 * 1000), RECOVERY_DELAY, TRIGGER_DELAY, now)).toBe("ok");
  });

  it("warns once the promised window (RECOVERY_DELAY) is missed", () => {
    expect(classifyStranding(openedAt(2 * 60 * 60 * 1000 + 60_000), RECOVERY_DELAY, TRIGGER_DELAY, now)).toBe("warn");
  });

  it("errors past TRIGGER_DELAY", () => {
    expect(classifyStranding(openedAt(25 * 60 * 60 * 1000), RECOVERY_DELAY, TRIGGER_DELAY, now)).toBe("error");
  });
});

describe("classifyRefundQueue", () => {
  const now = 1_800_000_000_000;
  it("is ok without an active refund or with a young one, warns after an hour, errors after four", () => {
    expect(classifyRefundQueue(null, false, now)).toBe("ok");
    expect(classifyRefundQueue(new Date(now - 10 * 60_000), false, now)).toBe("ok");
    expect(classifyRefundQueue(new Date(now - 61 * 60_000), false, now)).toBe("warn");
    expect(classifyRefundQueue(new Date(now - 5 * 60 * 60_000), false, now)).toBe("error");
  });
  it("always errors on a failed refund", () => {
    expect(classifyRefundQueue(new Date(now - 60_000), true, now)).toBe("error");
  });
});

describe("classifyVaultRunway", () => {
  const healthy = { balance: 1_000n * USDC, dailyBudget: 200n * USDC, paused: false, spentToday: 0n };

  it("is ok with a funded, unpaused vault and budget left today", () => {
    expect(classifyVaultRunway(healthy).severity).toBe("ok");
  });

  it("errors when paused or empty, since every below-floor swap then defers", () => {
    expect(classifyVaultRunway({ ...healthy, paused: true })).toMatchObject({ severity: "error" });
    expect(classifyVaultRunway({ ...healthy, balance: 0n })).toMatchObject({ severity: "error" });
  });

  it("warns below one day of budget or once today's budget is spent", () => {
    expect(classifyVaultRunway({ ...healthy, balance: 150n * USDC })).toMatchObject({ severity: "warn" });
    expect(classifyVaultRunway({ ...healthy, spentToday: 200n * USDC })).toMatchObject({ severity: "warn" });
  });
});

describe("diffAssociation", () => {
  const FORWARDER = "0xD7444AB7270A142227Fe659D63873ABdc8AF9b72";
  const IBAN = "EE08 7224 5745 6244 9516";
  const db = { forwarderAddress: FORWARDER, iban: IBAN };

  it("reports no changes when the live state matches (case- and space-insensitively)", () => {
    const live = {
      ibans: [{ address: FORWARDER.toLowerCase(), iban: "ee08722457456244 9516" }],
      profileAddresses: [FORWARDER.toLowerCase()]
    };
    expect(diffAssociation(db, live)).toEqual([]);
  });

  it("detects the forwarder being unlinked", () => {
    const changes = diffAssociation(db, { ibans: [{ address: FORWARDER, iban: IBAN }], profileAddresses: [] });
    expect(changes).toContain(`forwarder ${FORWARDER} is no longer linked to the profile`);
  });

  it("detects a new address linked to the profile", () => {
    const intruder = "0x9999999999999999999999999999999999999999";
    const changes = diffAssociation(db, {
      ibans: [{ address: FORWARDER, iban: IBAN }],
      profileAddresses: [FORWARDER, intruder]
    });
    expect(changes).toEqual([`unexpected address linked to the profile: ${intruder}`]);
  });

  it("expects the client's refund wallet on the profile, but nothing else", () => {
    const refund = "0x7777777777777777777777777777777777777777";
    const intruder = "0x9999999999999999999999999999999999999999";
    const withRefund = { ...db, refundAddress: refund };
    const ibans = [{ address: FORWARDER, iban: IBAN }];
    expect(diffAssociation(withRefund, { ibans, profileAddresses: [FORWARDER, refund.toLowerCase()] })).toEqual([]);
    expect(diffAssociation(withRefund, { ibans, profileAddresses: [FORWARDER, refund, intruder] })).toEqual([
      `unexpected address linked to the profile: ${intruder}`
    ]);
    // Without a derived refund address (seed not configured) the wallet is not excused.
    expect(diffAssociation(db, { ibans, profileAddresses: [FORWARDER, refund] })).toEqual([
      `unexpected address linked to the profile: ${refund}`
    ]);
  });

  it("does not excuse the IBAN moving to the refund wallet", () => {
    const refund = "0x7777777777777777777777777777777777777777";
    const changes = diffAssociation(
      { ...db, refundAddress: refund },
      { ibans: [{ address: refund, iban: IBAN }], profileAddresses: [FORWARDER, refund] }
    );
    expect(changes).toEqual([`IBAN ${IBAN} moved to address ${refund}`]);
  });

  it("detects the IBAN moving to another address (PATCH /ibans scenario)", () => {
    const elsewhere = "0x8888888888888888888888888888888888888888";
    const changes = diffAssociation(db, {
      ibans: [{ address: elsewhere, iban: IBAN }],
      profileAddresses: [FORWARDER]
    });
    expect(changes).toEqual([`IBAN ${IBAN} moved to address ${elsewhere}`]);
  });

  it("detects the IBAN disappearing", () => {
    const changes = diffAssociation(db, { ibans: [], profileAddresses: [FORWARDER] });
    expect(changes).toEqual([`IBAN ${IBAN} no longer exists at Monerium`]);
  });

  it("detects an unrecorded IBAN on the forwarder", () => {
    const other = "DE89370400440532013000";
    const changes = diffAssociation(
      { forwarderAddress: FORWARDER, iban: null },
      { ibans: [{ address: FORWARDER, iban: other }], profileAddresses: [FORWARDER] }
    );
    expect(changes).toEqual([`unrecorded IBAN issued for the forwarder: ${other}`]);
  });
});

describe("normalizeIban", () => {
  it("strips whitespace and uppercases", () => {
    expect(normalizeIban(" ee08 7224 5745\t6244 9516 ")).toBe("EE087224574562449516");
  });
});

describe("detectConfigDrift", () => {
  const base = {
    destination: "0x1111111111111111111111111111111111111111",
    floorPpm: 1500,
    targetPpm: 1250
  };

  it("reports nothing when the chain matches the db (case-insensitively)", () => {
    const onchain = { ...base, destination: base.destination.toLowerCase() };
    expect(detectConfigDrift(base, onchain)).toEqual({ errors: [], ownerAuthorizedUpdates: {} });
  });

  it("alarms on a destination change: the clone has no setter for it", () => {
    const drift = detectConfigDrift(base, { ...base, destination: "0x4444444444444444444444444444444444444444" });
    expect(drift.ownerAuthorizedUpdates).toEqual({});
    expect(drift.errors).toEqual([
      "destination changed on chain to 0x4444444444444444444444444444444444444444 (recorded 0x1111111111111111111111111111111111111111)"
    ]);
  });

  it("classifies a fee-policy change as a guardian-authorized reconciliation (P11)", () => {
    const drift = detectConfigDrift(base, { ...base, floorPpm: 3000, targetPpm: 2500 });
    expect(drift.errors).toEqual([]);
    expect(drift.ownerAuthorizedUpdates).toEqual({ floorPpm: 3000, targetPpm: 2500 });
  });
});

describe("eip1167RuntimeCode", () => {
  it("produces the canonical minimal-proxy runtime code for an implementation", () => {
    expect(eip1167RuntimeCode("0x7e1c653CaAFCa44258d8680B09F42a33475504a9")).toBe(
      "0x363d3d373d3d3d363d737e1c653caafca44258d8680b09f42a33475504a95af43d82803e903d91602b57fd5bf3"
    );
  });
});

describe("runExecutableDepthCheck", () => {
  afterEach(() => mock.restore());

  function arrange(chainId: number) {
    spyOn(chain, "getChainId").mockResolvedValue(chainId);
    const findAll = spyOn(MoneriumAccount, "findAll").mockResolvedValue([
      { forwarderAddress: "0x1111111111111111111111111111111111111111" } as MoneriumAccount
    ]);
    const reads: Record<string, unknown> = {
      latestRoundData: [1n, 114_000_000n, 0n, 0n, 1n],
      minSwapAmount: 1n * EUR,
      perSwapCap: 10_000n * EUR
    };
    spyOn(chain, "getPublicClient").mockReturnValue({
      readContract: async ({ functionName }: { functionName: string }) => reads[functionName]
    } as unknown as ReturnType<typeof chain.getPublicClient>);
    spyOn(chain, "getForwarderImmutables").mockResolvedValue({
      factory: "0x2222222222222222222222222222222222222222",
      oracle: "0x5555555555555555555555555555555555555555",
      oracleDecimals: 8,
      slippageBps: 60
    } as unknown as chain.ForwarderImmutables);
    spyOn(chain, "readEnabledRoutes").mockResolvedValue([{ index: 0, path: "0xaa" as Hex }]);
    const quoteSpy = spyOn(chain, "quoteRouteOutput").mockImplementation(async (_quoter, _path, amountIn) => {
      return (amountIn * 114n) / (100n * 10n ** 12n);
    });
    return { findAll, quoteSpy };
  }

  it("quotes on the Sepolia QuoterV2 on the sandbox chain", async () => {
    const { quoteSpy } = arrange(11_155_111);
    await runExecutableDepthCheck();
    expect(quoteSpy).toHaveBeenCalledWith("0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3", "0xaa", 1n * EUR);
  });

  it("quotes on the mainnet QuoterV2 on Ethereum", async () => {
    const { quoteSpy } = arrange(1);
    await runExecutableDepthCheck();
    expect(quoteSpy).toHaveBeenCalledWith("0x61fFE014bA17989E743c5F6cB21bF9697530B21e", "0xaa", 10_000n * EUR);
  });

  it("skips a chain without a known quoter", async () => {
    const { findAll, quoteSpy } = arrange(31_337);
    await runExecutableDepthCheck();
    expect(findAll).not.toHaveBeenCalled();
    expect(quoteSpy).not.toHaveBeenCalled();
  });
});

// A refund the keeper can never send: the clone holds less than MIN_SWAP_FLOOR, so the
// contract arms no batch and `recover` reverts. Only the operator can refund it.
describe("runStrandedBalanceMonitor below the swap floor", () => {
  const FACTORY = "0x2222222222222222222222222222222222222222" as Address;
  const EURE = "0x4444444444444444444444444444444444444444" as Address;
  const saved = { factory: config.moneriumB2b.forwarderFactoryAddress, rpcUrl: config.moneriumB2b.rpcUrl };
  let errors: string[];
  let warnings: string[];

  beforeAll(async () => {
    config.moneriumB2b.rpcUrl = undefined; // provisioning skips the on-chain clone check
    config.moneriumB2b.forwarderFactoryAddress = FACTORY;
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.rpcUrl = saved.rpcUrl;
    config.moneriumB2b.forwarderFactoryAddress = saved.factory;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    errors = [];
    warnings = [];
    const reads: Record<string, unknown> = { batchOpenedAt: 0n, MIN_SWAP_FLOOR: 1n * EUR, TRIGGER_DELAY: 86_400n };
    spyOn(chain, "getForwarderImmutables").mockResolvedValue({
      eure: EURE,
      factory: FACTORY,
      recoveryDelaySeconds: 7_200,
      usdc: "0x6666666666666666666666666666666666666666"
    } as unknown as chain.ForwarderImmutables);
    spyOn(chain, "getPublicClient").mockReturnValue({
      readContract: async ({ address, functionName }: { address: Address; functionName: string }) =>
        functionName === "balanceOf" ? (address === EURE ? EUR / 2n : 0n) : reads[functionName]
    } as unknown as ReturnType<typeof chain.getPublicClient>);
    spyOn(logger, "error").mockImplementation(((message: string) => {
      errors.push(message);
    }) as unknown as typeof logger.error);
    spyOn(logger, "warn").mockImplementation(((message: string) => {
      warnings.push(message);
    }) as unknown as typeof logger.warn);
  });

  afterEach(() => mock.restore());

  async function accountWithDeposit(status: MoneriumFiatDepositStatus, amountRaw = EUR / 2n) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    const { accountId } = await provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: "0x5555555555555555555555555555555555555555",
      externalSubjectId: "client-1",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      managerProfileId: manager.id,
      moneriumProfileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });
    await MoneriumAccount.update({ status: MoneriumAccountStatus.Active }, { where: { id: accountId } });
    return addDeposit(accountId, status, amountRaw);
  }

  let orders = 0;
  function addDeposit(accountId: string, status: MoneriumFiatDepositStatus, amountRaw: bigint) {
    orders += 1;
    return MoneriumFiatDeposit.create({
      accountId,
      amountRaw: amountRaw.toString(),
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: orders,
      mintedAt: new Date(),
      moneriumOrderId: `order-${orders}`,
      payerIban: "DE89370400440532013000",
      payerName: "Payer GmbH",
      status,
      txHash: `0xorder${orders}`
    });
  }

  function execution(deposit: MoneriumFiatDeposit, kind: MoneriumConversionExecutionKind, status: MoneriumConversionExecutionStatus) {
    return MoneriumConversionExecution.create({
      accountId: deposit.accountId,
      depositId: deposit.id,
      destination: "0x5555555555555555555555555555555555555555",
      eureInRaw: deposit.amountRaw,
      kind,
      status,
      usdcNetRaw: "0"
    });
  }

  it("asks the operator to refund a payment marked for recovery that the contract cannot recover", async () => {
    const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering);
    await runStrandedBalanceMonitor();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(deposit.id);
    expect(errors[0]).toContain("refund each by hand");
    expect(errors[0]).toContain("vortex-refund:<depositId>");
  });

  for (const status of [MoneriumConversionExecutionStatus.Pending, MoneriumConversionExecutionStatus.Confirmed]) {
    it(`stays quiet while the keeper's recover is ${status} (the automatic refund is under way)`, async () => {
      const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering);
      await execution(deposit, MoneriumConversionExecutionKind.Recover, status);
      await runStrandedBalanceMonitor();
      expect(errors).toEqual([]);
    });
  }

  it("never asks to refund a payment whose funds already left the clone", async () => {
    // A 100 EUR payment converted and forwarded on the permissionless path, unseen by the ledger.
    const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering, 100n * EUR);
    await runStrandedBalanceMonitor();
    expect(errors).toEqual([]);
    expect(warnings.some(message => message.includes(deposit.id) && message.includes("do not refund"))).toBe(true);
  });

  it("never asks to refund a swapped payment, even when the clone holds as much EURe", async () => {
    // Its USDC left on the unrecorded forwardAll; the 0.5 EURe on the clone is someone else's.
    const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering, (EUR * 4n) / 10n);
    await execution(deposit, MoneriumConversionExecutionKind.Swap, MoneriumConversionExecutionStatus.Confirmed);
    await runStrandedBalanceMonitor();
    expect(errors).toEqual([]);
    expect(warnings.some(message => message.includes(deposit.id) && message.includes("do not refund"))).toBe(true);
  });

  // EURe the ledger places on the clone for other payments: a younger one still settling, or
  // one refunded by hand (its EURe never left the clone).
  for (const other of [MoneriumFiatDepositStatus.Minted, MoneriumFiatDepositStatus.Refunded]) {
    it(`does not count a ${other} payment's EURe as the marked payment's`, async () => {
      const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering, (EUR * 3n) / 10n);
      await addDeposit(deposit.accountId, other, (EUR * 4n) / 10n);
      await runStrandedBalanceMonitor();
      expect(errors).toEqual([]);
      expect(warnings.some(message => message.includes(deposit.id) && message.includes("do not refund"))).toBe(true);
    });
  }

  it("still asks to refund when the clone holds the marked payment and the others' EURe", async () => {
    const deposit = await accountWithDeposit(MoneriumFiatDepositStatus.Recovering, (EUR * 2n) / 10n);
    await addDeposit(deposit.accountId, MoneriumFiatDepositStatus.Minted, (EUR * 3n) / 10n);
    const recovered = await addDeposit(deposit.accountId, MoneriumFiatDepositStatus.Refunded, EUR);
    await execution(recovered, MoneriumConversionExecutionKind.Recover, MoneriumConversionExecutionStatus.Confirmed);
    await runStrandedBalanceMonitor();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(deposit.id);
  });

  it("stays quiet while such a payment is not marked for recovery yet", async () => {
    await accountWithDeposit(MoneriumFiatDepositStatus.Minted);
    await runStrandedBalanceMonitor();
    expect(errors).toEqual([]);
  });
});
