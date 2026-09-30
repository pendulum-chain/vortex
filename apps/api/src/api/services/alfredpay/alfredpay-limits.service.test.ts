import { afterAll, describe, expect, test } from "bun:test";
import {
  AlfredpayApiService,
  type AlfredpayConfigPair,
  DomesticCustomerType,
  FiatToken,
  type GetAllConfigsResponse,
  getAnyFiatTokenDetails,
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
    pair({ decimals: null, id: "junk-individual", typeCustomer: DomesticCustomerType.INDIVIDUAL }),
    pair({ decimals: null, id: "junk-wildcard" }),
    pair({ decimals: "", id: "junk-empty-decimals" }),
    pair({ decimals: null, fromCurrency: null, id: "junk-null-currency" }),
    // Oversized decimals would make Big(10).pow throw and abort the whole refresh.
    pair({ decimals: "999999999999999999999999", id: "junk-huge-decimals", typeCustomer: DomesticCustomerType.INDIVIDUAL })
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
    const limits = service.getLimits(FiatToken.MXN, "USDC", DomesticCustomerType.INDIVIDUAL, RampDirection.BUY);
    expect(limits).toEqual({ maxRaw: "17079999", minRaw: "5000" });
  });

  test("indexes ARS rows from the provider configuration", async () => {
    AlfredpayApiService.getInstance = () =>
      ({
        getAllConfigs: async () => ({
          supportedPairs: [
            pair({
              fromCurrency: "ARS",
              maxQuantity: "250000",
              minQuantity: "1000",
              toCurrency: "USDT",
              typeCustomer: DomesticCustomerType.INDIVIDUAL
            })
          ]
        })
      }) as unknown as AlfredpayApiService;

    const service = new (AlfredpayLimitsService as unknown as { new (): AlfredpayLimitsService })();
    await (service as unknown as { refresh(): Promise<void> }).refresh();

    expect(service.getLimits(FiatToken.ARS, "USDT", DomesticCustomerType.INDIVIDUAL, RampDirection.BUY)).toEqual({
      maxRaw: "25000000",
      minRaw: "100000"
    });
  });

  async function refreshWith(...batches: AlfredpayConfigPair[][]): Promise<AlfredpayLimitsService> {
    const service = new (AlfredpayLimitsService as unknown as { new (): AlfredpayLimitsService })();
    for (const supportedPairs of batches) {
      AlfredpayApiService.getInstance = () => ({ getAllConfigs: async () => ({ supportedPairs }) }) as unknown as AlfredpayApiService;
      await (service as unknown as { refresh(): Promise<void> }).refresh();
    }
    return service;
  }

  const configured = (fiat: FiatToken) => {
    const limits = getAnyFiatTokenDetails(fiat).alfredpayLimits;
    if (!limits) throw new Error(`no configured Alfredpay limits for ${fiat}`);
    return limits;
  };
  const arsMin = pair({ fromCurrency: "ARS", maxQuantity: null, minQuantity: "1234.56", toCurrency: "USDT" });

  /**
   * The Penny adapter serves null quantities on most pairs (2026-09-30). `new Big(null)` threw and
   * aborted the whole refresh, so no provider bound was ever applied.
   */
  test("keeps each customer type's configured bound where Alfred sets no limit", async () => {
    const service = await refreshWith([arsMin]);

    for (const customer of [DomesticCustomerType.INDIVIDUAL, DomesticCustomerType.BUSINESS]) {
      expect(service.getLimits(FiatToken.ARS, "USDT", customer, RampDirection.BUY)).toEqual({
        maxRaw: configured(FiatToken.ARS).onramp.USDT[customer].maxRaw,
        minRaw: "123456"
      });
    }
  });

  test("a malformed bound or an unknown customer type does not lose the other rows", async () => {
    const service = await refreshWith([
      pair({ maxQuantity: undefined as unknown as null, minQuantity: "" }),
      pair({ maxQuantity: null, minQuantity: "10.00", typeCustomer: "COMPANY" as DomesticCustomerType }),
      arsMin
    ]);

    expect(service.getLimits(FiatToken.ARS, "USDT", DomesticCustomerType.INDIVIDUAL, RampDirection.BUY).minRaw).toBe("123456");
  });

  test("a row without any bound does not shadow a real row for the same pair", async () => {
    const real = pair({ maxQuantity: "1000.00", minQuantity: "99.00" });
    const service = await refreshWith([
      pair({ maxQuantity: null, minQuantity: null }),
      pair({ maxQuantity: null, minQuantity: null, typeCustomer: DomesticCustomerType.INDIVIDUAL }),
      real
    ]);

    for (const customer of [DomesticCustomerType.INDIVIDUAL, DomesticCustomerType.BUSINESS]) {
      expect(service.getLimits(FiatToken.MXN, "USDC", customer, RampDirection.BUY)).toEqual({ maxRaw: "100000", minRaw: "9900" });
    }
  });

  test("an empty listing keeps the previous limits", async () => {
    const service = await refreshWith([arsMin], []);

    expect(service.getLimits(FiatToken.ARS, "USDT", DomesticCustomerType.INDIVIDUAL, RampDirection.BUY).minRaw).toBe("123456");
  });

  test("a row scaled against the currency's convention is skipped", async () => {
    // BUY limits are read back with the fiat's 2 decimals; a "6" row would be 10^4 off.
    const service = await refreshWith([pair({ decimals: "6", maxQuantity: null, minQuantity: "150.00" })]);

    expect(service.getLimits(FiatToken.MXN, "USDC", DomesticCustomerType.INDIVIDUAL, RampDirection.BUY)).toEqual(
      configured(FiatToken.MXN).onramp.USDC[DomesticCustomerType.INDIVIDUAL]
    );
  });
});
