import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { DomesticCountry, BrlaApiService, EvmToken, FiatToken, RampDirection } from "@vortexfi/shared";
import CustomerEntity from "../../models/customerEntity.model";
import ProviderCustomer from "../../models/providerCustomer.model";
import RampState from "../../models/rampState.model";
import User from "../../models/user.model";
import { clearAlfredpayMonthlyUsageCache } from "./alfredpay/alfredpay.helpers";
import { getUserLimits } from "./limits.service";

const originals = {
  brlaGetInstance: BrlaApiService.getInstance,
  customerEntityFindAll: CustomerEntity.findAll,
  customerEntityFindOne: CustomerEntity.findOne,
  providerCustomerFindAll: ProviderCustomer.findAll,
  providerCustomerFindOne: ProviderCustomer.findOne,
  rampFindAll: RampState.findAll,
  userFindByPk: User.findByPk
};

beforeEach(() => {
  clearAlfredpayMonthlyUsageCache();
  User.findByPk = mock(async () => null) as unknown as typeof User.findByPk;
  CustomerEntity.findAll = mock(async () => [{ id: "entity-1" }]) as unknown as typeof CustomerEntity.findAll;
  CustomerEntity.findOne = mock(async () => ({ id: "entity-1" })) as unknown as typeof CustomerEntity.findOne;
});

afterEach(() => {
  BrlaApiService.getInstance = originals.brlaGetInstance;
  CustomerEntity.findAll = originals.customerEntityFindAll;
  CustomerEntity.findOne = originals.customerEntityFindOne;
  ProviderCustomer.findAll = originals.providerCustomerFindAll;
  ProviderCustomer.findOne = originals.providerCustomerFindOne;
  RampState.findAll = originals.rampFindAll;
  User.findByPk = originals.userFindByPk;
  clearAlfredpayMonthlyUsageCache();
});

describe("getUserLimits", () => {
  it("returns both AlfredPay directions using routed monthly usage", async () => {
    ProviderCustomer.findOne = mock(async () => ({ customerType: "individual" })) as unknown as typeof ProviderCustomer.findOne;
    RampState.findAll = mock(async () => [
      {
        quote: {
          inputAmount: "100",
          inputCurrency: FiatToken.USD,
          metadata: { blocks: { alfredpayMint: { currency: FiatToken.USD, inputAmountDecimal: "100" } } },
          outputCurrency: EvmToken.ETH
        },
        type: RampDirection.BUY
      },
      {
        quote: {
          inputAmount: "1",
          inputCurrency: EvmToken.ETH,
          metadata: {
            blocks: {
              alfredpayOfframp: {
                currency: FiatToken.USD,
                inputAmountDecimal: "25.5",
                token: EvmToken.USDT
              }
            }
          },
          outputCurrency: FiatToken.USD
        },
        type: RampDirection.SELL
      }
    ]) as unknown as typeof RampState.findAll;

    const response = await getUserLimits("user-1", ["US"]);

    expect(response.limits).toHaveLength(2);
    expect(response.limits[0]).toMatchObject({
      corridor: "US",
      currency: FiatToken.USD,
      direction: RampDirection.BUY,
      max: "100000",
      used: "100"
    });
    expect(response.limits[1]).toMatchObject({
      corridor: "US",
      currency: EvmToken.USDT,
      direction: RampDirection.SELL,
      max: "100000",
      used: "25.5"
    });
    expect(response.limits[0].period.type).toBe("calendar_month");
  });

  it("passes through Avenia BRL max, used, and reported month", async () => {
    ProviderCustomer.findAll = mock(async () => [
      {
        country: DomesticCountry.BR,
        customerType: "individual",
        providerSubaccountId: "subaccount-1",
        taxReference: "12345678901"
      }
    ]) as unknown as typeof ProviderCustomer.findAll;
    const getSubaccountUsedLimit = mock(async () => ({
      limitInfo: {
        blocked: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        limits: [
          {
            currency: "BRL",
            maxChainIn: "0",
            maxChainOut: "0",
            maxFiatIn: "10000",
            maxFiatOut: "9000",
            usedLimit: {
              month: 7,
              usedChainIn: "0",
              usedChainOut: "0",
              usedFiatIn: "150.5",
              usedFiatOut: "25",
              year: 2026
            }
          }
        ]
      }
    }));
    BrlaApiService.getInstance = () => ({ getSubaccountUsedLimit }) as unknown as BrlaApiService;

    const response = await getUserLimits("user-1", ["BR"]);

    expect(getSubaccountUsedLimit).toHaveBeenCalledWith("subaccount-1");
    expect(response.limits).toEqual([
      {
        corridor: "BR",
        currency: FiatToken.BRL,
        direction: RampDirection.BUY,
        max: "10000",
        period: {
          endsAt: "2026-08-01T00:00:00.000Z",
          startsAt: "2026-07-01T00:00:00.000Z",
          type: "calendar_month"
        },
        used: "150.5"
      },
      {
        corridor: "BR",
        currency: FiatToken.BRL,
        direction: RampDirection.SELL,
        max: "9000",
        period: {
          endsAt: "2026-08-01T00:00:00.000Z",
          startsAt: "2026-07-01T00:00:00.000Z",
          type: "calendar_month"
        },
        used: "25"
      }
    ]);
  });
});
