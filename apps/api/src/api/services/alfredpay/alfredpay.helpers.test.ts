import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredpayCustomerType, EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import RampState from "../../../models/rampState.model";
import {
  clearAlfredpayMonthlyUsageCache,
  getAlfredpayMonthlyUsage,
  resolveAlfredpayQuoteLimits
} from "./alfredpay.helpers";

describe("resolveAlfredpayQuoteLimits", () => {
  it("uses the AlfredPay settlement token for a routed onramp", async () => {
    const limits = await resolveAlfredpayQuoteLimits({
      inputCurrency: FiatToken.MXN,
      outputCurrency: EvmToken.ETH,
      rampType: RampDirection.BUY
    });

    expect(limits).toMatchObject({
      customer: AlfredpayCustomerType.INDIVIDUAL,
      fiat: FiatToken.MXN,
      stablecoin: EvmToken.USDT
    });
  });
});

describe("getAlfredpayMonthlyUsage", () => {
  const originalFindAll = RampState.findAll;

  beforeEach(() => clearAlfredpayMonthlyUsageCache());

  afterEach(() => {
    RampState.findAll = originalFindAll;
    clearAlfredpayMonthlyUsageCache();
  });

  it("counts routed provider-leg amounts and caches the monthly aggregate", async () => {
    const findAll = mock(async () => [
      {
        quote: {
          inputAmount: "999",
          inputCurrency: FiatToken.MXN,
          metadata: { blocks: { alfredpayMint: { currency: FiatToken.MXN, inputAmountDecimal: "125.5" } } },
          outputCurrency: EvmToken.ETH
        },
        type: RampDirection.BUY
      },
      {
        quote: {
          inputAmount: "2",
          inputCurrency: EvmToken.ETH,
          metadata: {
            blocks: {
              alfredpayOfframp: {
                currency: FiatToken.MXN,
                inputAmountDecimal: "40.25",
                token: EvmToken.USDT
              }
            }
          },
          outputCurrency: FiatToken.MXN
        },
        type: RampDirection.SELL
      }
    ]);
    RampState.findAll = findAll as unknown as typeof RampState.findAll;

    expect((await getAlfredpayMonthlyUsage("user-1", RampDirection.BUY, FiatToken.MXN, "USDT")).toFixed()).toBe(
      "125.5"
    );
    expect((await getAlfredpayMonthlyUsage("user-1", RampDirection.SELL, FiatToken.MXN, "USDT")).toFixed()).toBe(
      "40.25"
    );
    expect(findAll).toHaveBeenCalledTimes(1);
  });

  it("counts direct ramps persisted before provider block metadata", async () => {
    RampState.findAll = mock(async () => [
      {
        quote: {
          inputAmount: "12.75",
          inputCurrency: EvmToken.USDT,
          metadata: { blocks: {} },
          outputCurrency: FiatToken.COP
        },
        type: RampDirection.SELL
      }
    ]) as unknown as typeof RampState.findAll;

    const used = await getAlfredpayMonthlyUsage("user-1", RampDirection.SELL, FiatToken.COP, "USDT");
    expect(used.toFixed()).toBe("12.75");
  });
});
