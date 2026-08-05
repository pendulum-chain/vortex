import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredpayCustomerType, EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import RampState from "../../../models/rampState.model";
import {
  clearAlfredpayMonthlyUsageCache,
  getAlfredpayMonthlyUsageForEnforcement,
  getReportedAlfredpayMonthlyUsage,
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

describe("Alfredpay monthly usage", () => {
  const originalFindAll = RampState.findAll;

  beforeEach(() => clearAlfredpayMonthlyUsageCache());

  afterEach(() => {
    RampState.findAll = originalFindAll;
    clearAlfredpayMonthlyUsageCache();
  });

  it("queries uncached direct-pair usage for quote enforcement", async () => {
    let query:
      | {
          include: Array<{ where: Record<string, unknown> }>;
          where: { createdAt?: unknown; type?: RampDirection };
        }
      | undefined;
    const findAll = mock(async () => [
      {
        quote: { inputAmount: "12.75" }
      }
    ]);
    RampState.findAll = mock(async options => {
      query = options as typeof query;
      return findAll();
    }) as unknown as typeof RampState.findAll;

    expect(
      (await getAlfredpayMonthlyUsageForEnforcement("user-1", RampDirection.SELL, FiatToken.COP, "USDT")).toFixed()
    ).toBe("12.75");
    await getAlfredpayMonthlyUsageForEnforcement("user-1", RampDirection.SELL, FiatToken.COP, "USDT");

    expect(findAll).toHaveBeenCalledTimes(2);
    expect(query?.where.createdAt).toBeDefined();
    expect(query?.where.type).toBe(RampDirection.SELL);
    expect(query?.include[0].where).toEqual({ inputCurrency: "USDT", outputCurrency: FiatToken.COP });
  });

  it("counts routed provider-leg amounts and caches the reported aggregate", async () => {
    let query: { where: { [Op.and]: { val: string }; createdAt?: unknown } } | undefined;
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
    RampState.findAll = mock(async options => {
      query = options as typeof query;
      return findAll();
    }) as unknown as typeof RampState.findAll;

    expect((await getReportedAlfredpayMonthlyUsage("user-1", RampDirection.BUY, FiatToken.MXN, "USDT")).toFixed()).toBe(
      "125.5"
    );
    expect(
      (await getReportedAlfredpayMonthlyUsage("user-1", RampDirection.SELL, FiatToken.MXN, "USDT")).toFixed()
    ).toBe("40.25");
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(query?.where.createdAt).toBeUndefined();
    expect(query?.where[Op.and].val).toContain("phase_history");
    expect(query?.where[Op.and].val).toContain("entry->>'timestamp'");
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

    const used = await getReportedAlfredpayMonthlyUsage("user-1", RampDirection.SELL, FiatToken.COP, "USDT");
    expect(used.toFixed()).toBe("12.75");
  });
});
