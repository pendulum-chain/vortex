import { describe, expect, it } from "bun:test";
import {
  classifyExecutableDepth,
  classifyRefundQueue,
  classifyStranding,
  classifyVaultRunway,
  computeQuoteImpactBps,
  detectConfigDrift,
  diffAssociation,
  eip1167RuntimeCode,
  normalizeIban
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
