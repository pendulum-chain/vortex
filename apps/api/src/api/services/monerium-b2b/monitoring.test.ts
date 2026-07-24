import { describe, expect, it } from "bun:test";
import {
  classifyStranding,
  computeQuoteImpactBps,
  detectConfigDrift,
  diffAssociation,
  eip1167RuntimeCode,
  normalizeIban,
  STRANDED_WARN_MS
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

describe("classifyStranding", () => {
  const TRIGGER_DELAY = 86_400n; // 24h, registry P4 placeholder
  const now = 1_800_000_000_000; // fixed epoch ms

  const armedAt = (msAgo: number): bigint => BigInt(Math.floor((now - msAgo) / 1000));

  it("is ok when the marker is not armed", () => {
    expect(classifyStranding(0n, TRIGGER_DELAY, now)).toBe("ok");
  });

  it("is ok within the warn window", () => {
    expect(classifyStranding(armedAt(60 * 60 * 1000), TRIGGER_DELAY, now)).toBe("ok");
  });

  it("warns after 12h", () => {
    expect(classifyStranding(armedAt(STRANDED_WARN_MS + 60_000), TRIGGER_DELAY, now)).toBe("warn");
  });

  it("errors past TRIGGER_DELAY", () => {
    expect(classifyStranding(armedAt(25 * 60 * 60 * 1000), TRIGGER_DELAY, now)).toBe("error");
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
    fallbackAddress: "0x0d6455B4E46A4C9847f121Bd134B91B9666d6Df1",
    feeBps: 0
  };

  it("reports nothing when the chain matches the db (case-insensitively)", () => {
    const onchain = { ...base, destination: base.destination.toLowerCase() };
    expect(detectConfigDrift(base, onchain)).toEqual({ errors: [], ownerAuthorizedUpdates: {} });
  });

  it("classifies destination/fallback changes as owner-authorized updates (R07)", () => {
    const onchain = {
      ...base,
      destination: "0x4444444444444444444444444444444444444444",
      fallbackAddress: "0x5555555555555555555555555555555555555555"
    };
    const drift = detectConfigDrift(base, onchain);
    expect(drift.errors).toEqual([]);
    expect(drift.ownerAuthorizedUpdates).toEqual({
      destination: onchain.destination,
      fallbackAddress: onchain.fallbackAddress
    });
  });

  it("classifies a feeBps change as an error, never a reconciliation", () => {
    const drift = detectConfigDrift(base, { ...base, feeBps: 50 });
    expect(drift.errors).toEqual(["immutable feeBps mismatch: db=0 chain=50"]);
    expect(drift.ownerAuthorizedUpdates).toEqual({});
  });
});

describe("eip1167RuntimeCode", () => {
  it("produces the canonical minimal-proxy runtime code for an implementation", () => {
    expect(eip1167RuntimeCode("0x7e1c653CaAFCa44258d8680B09F42a33475504a9")).toBe(
      "0x363d3d373d3d3d363d737e1c653caafca44258d8680b09f42a33475504a95af43d82803e903d91602b57fd5bf3"
    );
  });
});
