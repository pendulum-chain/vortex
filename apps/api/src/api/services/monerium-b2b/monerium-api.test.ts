import { describe, expect, it } from "bun:test";
import type { MoneriumAddress, MoneriumIban } from "@vortexfi/shared";
import { selectAccountIban, selectProfileChainAddresses } from "./monerium-api";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const PROFILE = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE = "22222222-2222-4222-8222-222222222222";

function iban(overrides: Partial<MoneriumIban>): MoneriumIban {
  return {
    address: ADDRESS,
    bic: "AIBKIE2D",
    chain: "ethereum",
    iban: "EE08 7224 5745 6244 9516",
    name: "Client Ltd",
    profile: PROFILE,
    ...overrides
  };
}

describe("Monerium B2B provider scope selection", () => {
  it("selects an IBAN only for the exact profile, chain, and address", () => {
    const correct = iban({});
    const ibans = [
      iban({ chain: "sepolia", iban: "EE52 1273 8426 8857 1285" }),
      iban({ iban: "EE24 2200 2210 2014 5685", profile: OTHER_PROFILE }),
      correct
    ];

    expect(selectAccountIban(ibans, ADDRESS.toLowerCase(), "ethereum", PROFILE)).toBe(correct);
    expect(selectAccountIban(ibans, ADDRESS, "sepolia", OTHER_PROFILE)).toBeNull();
  });

  it("refuses an ambiguous exact IBAN match", () => {
    expect(() => selectAccountIban([iban({}), iban({ iban: "EE52 1273 8426 8857 1285" })], ADDRESS, "ethereum", PROFILE)).toThrow(
      "Multiple Monerium IBANs matched"
    );
  });

  it("keeps only addresses linked to the expected profile and chain", () => {
    const entries: MoneriumAddress[] = [
      { address: ADDRESS, chains: ["sepolia"], profile: PROFILE },
      { address: ADDRESS, chains: ["ethereum"], profile: OTHER_PROFILE },
      { address: ADDRESS.toLowerCase(), chains: ["ethereum"], profile: PROFILE }
    ];

    expect(selectProfileChainAddresses(entries, PROFILE, "ethereum")).toEqual([ADDRESS.toLowerCase()]);
  });
});
