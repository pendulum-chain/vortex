import { describe, expect, test } from "bun:test";
import { buildEntryReport, buildRouteReport } from "./generate-report";

const FIXTURE_TSCONFIG = "scripts/wire-contract/fixtures/tsconfig.json";
const FIXTURE_ENTRY = "scripts/wire-contract/fixtures/fixture-surface.ts";

const EXPECTED_FIXTURE_REPORT = `FixtureClient: class FixtureClient {
  constructor(baseUrl: string, timeoutMs?: number);
  createRequest: (currency: "ars" | "brl" | "eur", verbose?: boolean) => Promise<{
    amounts: Record<"ars" | "brl" | "eur", {
      amountRaw: string;
      direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
      readonly id: string;
    }>;
    currency: "ars" | "brl" | "eur";
    memo?: string;
    nested: {
      amountRaw: string;
      direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
      readonly id: string;
    };
    next?: <circular FixtureRequest>;
    roTuple: readonly [string, number];
    tags: Array<string>;
    tuple: [string, number];
    verbose?: boolean;
  }>;
  merge: <T extends {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    readonly id: string;
  }>(base: T, patch?: Partial<T>) => T;
  readonly retries: number;
}

FixtureCurrency: "ars" | "brl" | "eur"

FixtureDirection: enum FixtureDirection { BUY = "buy", SELL = "sell" }

FixtureIndexed: {
  readonly [key: string]: string;
}

FixtureNested: {
  amountRaw: string;
  direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
  readonly id: string;
}

FixtureOutcome: <T extends {
  amounts: Record<"ars" | "brl" | "eur", {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    readonly id: string;
  }>;
  currency: "ars" | "brl" | "eur";
  memo?: string;
  nested: {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    readonly id: string;
  };
  next?: <circular FixtureRequest>;
  roTuple: readonly [string, number];
  tags: Array<string>;
  tuple: [string, number];
  verbose?: boolean;
}> T extends {
  verbose: true;
} ? {
  amountRaw: string;
  direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
  readonly id: string;
} : "ars" | "brl" | "eur"

FixtureRequest: {
  amounts: Record<"ars" | "brl" | "eur", {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    readonly id: string;
  }>;
  currency: "ars" | "brl" | "eur";
  memo?: string;
  nested: {
    amountRaw: string;
    direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
    readonly id: string;
  };
  next?: <circular FixtureRequest>;
  roTuple: readonly [string, number];
  tags: Array<string>;
  tuple: [string, number];
  verbose?: boolean;
}

FixtureResult: null | {
  amountRaw: string;
  direction: enum FixtureDirection { BUY = "buy", SELL = "sell" };
  readonly id: string;
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

describe("wire-contract route table", () => {
  test("follows app/router mounts, path aliases and route() chains, ignoring the settings getter", () => {
    expect(buildRouteReport("scripts/wire-contract/fixtures/routes/app.ts")).toBe(
      [
        "GET /legacy",
        "POST /legacy",
        "DELETE /legacy/:id",
        "GET /legacy/:id",
        "GET /old",
        "POST /old",
        "DELETE /old/:id",
        "GET /old/:id",
        "GET /v1/items",
        "POST /v1/items",
        "DELETE /v1/items/:id",
        "GET /v1/items/:id",
        "GET /v1/status",
        "GET /v1/things",
        "POST /v1/things",
        "DELETE /v1/things/:id",
        "GET /v1/things/:id"
      ].join("\n")
    );
  });

  test("fails loudly on a route path it cannot read statically", () => {
    expect(() => buildRouteReport("scripts/wire-contract/fixtures/routes/dynamic.route.ts")).toThrow(
      "Unsupported route declaration at scripts/wire-contract/fixtures/routes/dynamic.route.ts:6"
    );
  });
});
