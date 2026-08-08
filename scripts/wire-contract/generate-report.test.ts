import { describe, expect, test } from "bun:test";
import { buildEntryReport } from "./generate-report";

const FIXTURE_TSCONFIG = "scripts/wire-contract/fixtures/tsconfig.json";
const FIXTURE_ENTRY = "scripts/wire-contract/fixtures/fixture-surface.ts";

const EXPECTED_FIXTURE_REPORT = `FixtureClient: class FixtureClient {
  constructor(baseUrl: string, timeoutMs?: number);
  createRequest: (currency: "ars" | "brl" | "eur", verbose?: boolean) => Promise<{
    amounts: Record<"ars" | "brl" | "eur", {
      amountRaw: string;
      direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    }>;
    currency: "ars" | "brl" | "eur";
    memo?: string;
    nested: {
      amountRaw: string;
      direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    };
    next?: <circular FixtureRequest>;
    tags: Array<string>;
    tuple: [string, number];
    verbose?: boolean;
  }>;
}

FixtureCurrency: "ars" | "brl" | "eur"

FixtureDirection: enum FixtureDirection { BUY = "buy", SELL = "sell" }

FixtureNested: {
  amountRaw: string;
  direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
}

FixtureRequest: {
  amounts: Record<"ars" | "brl" | "eur", {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
  }>;
  currency: "ars" | "brl" | "eur";
  memo?: string;
  nested: {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
  };
  next?: <circular FixtureRequest>;
  tags: Array<string>;
  tuple: [string, number];
  verbose?: boolean;
}

FixtureResult: null | {
  amountRaw: string;
  direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
}`;

describe("wire-contract surface serializer", () => {
  test("renders the fixture surface exactly (enums with values, structural expansion, sorted props, cycle guard)", () => {
    expect(buildEntryReport(FIXTURE_TSCONFIG, FIXTURE_ENTRY)).toBe(EXPECTED_FIXTURE_REPORT);
  });

  test("is deterministic across independent program instances", () => {
    expect(buildEntryReport(FIXTURE_TSCONFIG, FIXTURE_ENTRY)).toBe(buildEntryReport(FIXTURE_TSCONFIG, FIXTURE_ENTRY));
  });

  test("never leaks filesystem paths into the report", () => {
    const report = buildEntryReport(FIXTURE_TSCONFIG, FIXTURE_ENTRY);
    expect(report).not.toContain("/Users/");
    expect(report).not.toContain("node_modules");
    expect(report).not.toContain("import(");
  });
});
