import { describe, expect, it } from "bun:test";
import { FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import {
  RampTransactionPreparationKind,
  selectRampTransactionPreparationKind
} from "./ramp-transaction-preparation";

describe("selectRampTransactionPreparationKind", () => {
  it("selects the BRL offramp preparer for sell quotes that output BRL", () => {
    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.BRL,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.SELL
      })
    ).toBe(RampTransactionPreparationKind.OfframpBrl);
  });

  it("uses the Monerium offramp preparer only when the Monerium auth token is present", () => {
    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.EURC,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.SELL
      })
    ).toBe(RampTransactionPreparationKind.OfframpNonBrl);

    expect(
      selectRampTransactionPreparationKind(
        {
          inputCurrency: FiatToken.EURC,
          outputCurrency: FiatToken.EURC,
          rampType: RampDirection.SELL
        },
        { moneriumAuthToken: "token" }
      )
    ).toBe(RampTransactionPreparationKind.OfframpMonerium);
  });

  it("routes EURC onramps by destination network: AssetHub → Monerium, EVM → Mykobo", () => {
    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.EURC,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.BUY,
        to: Networks.AssetHub
      })
    ).toBe(RampTransactionPreparationKind.OnrampMonerium);

    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.EURC,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.BUY,
        to: Networks.Base
      })
    ).toBe(RampTransactionPreparationKind.OnrampMykobo);

    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.EURC,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.BUY
      })
    ).toBe(RampTransactionPreparationKind.OnrampMykobo);
  });

  it("selects non-EURC onramp preparers from the fiat input token", () => {
    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.USD,
        outputCurrency: FiatToken.USD,
        rampType: RampDirection.BUY
      })
    ).toBe(RampTransactionPreparationKind.OnrampAlfredpay);

    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.BRL,
        outputCurrency: FiatToken.BRL,
        rampType: RampDirection.BUY
      })
    ).toBe(RampTransactionPreparationKind.OnrampAvenia);
  });
});
