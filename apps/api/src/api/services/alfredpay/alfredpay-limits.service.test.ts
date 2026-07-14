import { afterAll, describe, expect, test } from "bun:test";
import {
  AlfredpayApiService,
  type AlfredpayConfigPair,
  AlfredpayCustomerType,
  FiatToken,
  type GetAllConfigsResponse,
  RampDirection
} from "@vortexfi/shared";
import { AlfredpayLimitsService } from "./alfredpay-limits.service";

/**
 * The live /allConfigs listing contains junk rows: `decimals` null or "", even a null
 * `fromCurrency` (observed 2026-07-14). Regression test: such rows must be skipped, not
 * indexed — Number(null) is 0, and a customer-specific null-decimals row would otherwise
 * override the valid wildcard row and shrink the raw limits by 10^decimals.
 */

function pair(overrides: Partial<AlfredpayConfigPair>): AlfredpayConfigPair {
  return {
    businessId: null,
    createdAt: "2026-01-01T00:00:00Z",
    decimals: "2",
    fromCurrency: "MXN",
    id: "pair",
    maxQuantity: "170799.99",
    minQuantity: "50.00",
    toCurrency: "USDC",
    typeCustomer: null,
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

const configsResponse: GetAllConfigsResponse = {
  supportedPairs: [
    // The only trustworthy row: wildcard MXN -> USDC with explicit decimals.
    pair({ id: "valid-wildcard" }),
    // Junk rows as served live; the INDIVIDUAL one would take precedence if indexed.
    pair({ decimals: null, id: "junk-individual", typeCustomer: AlfredpayCustomerType.INDIVIDUAL }),
    pair({ decimals: null, id: "junk-wildcard" }),
    pair({ decimals: "", id: "junk-empty-decimals" }),
    pair({ decimals: null, fromCurrency: null, id: "junk-null-currency" })
  ]
};

const originalGetInstance = AlfredpayApiService.getInstance;
afterAll(() => {
  AlfredpayApiService.getInstance = originalGetInstance;
});

describe("AlfredpayLimitsService.refresh", () => {
  test("indexes only rows with digit-string decimals; junk rows never shadow valid ones", async () => {
    AlfredpayApiService.getInstance = () =>
      ({ getAllConfigs: async () => configsResponse }) as unknown as AlfredpayApiService;

    const service = new (AlfredpayLimitsService as unknown as { new (): AlfredpayLimitsService })();
    await (service as unknown as { refresh(): Promise<void> }).refresh();

    // From the valid wildcard row: 50.00 / 170799.99 scaled by 10^2 — not 10^0.
    const limits = service.getLimits(FiatToken.MXN, "USDC", AlfredpayCustomerType.INDIVIDUAL, RampDirection.BUY);
    expect(limits).toEqual({ maxRaw: "17079999", minRaw: "5000" });
  });
});
