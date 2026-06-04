import { describe, expect, it } from "bun:test";
import { FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import { RampTransactionPreparationKind, selectRampTransactionPreparationKind } from "./ramp-transaction-preparation";

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

  it("selects the non-BRL offramp preparer for EUR sell quotes (Mykobo offramp handled downstream)", () => {
    expect(
      selectRampTransactionPreparationKind({
        inputCurrency: FiatToken.EURC,
        outputCurrency: FiatToken.EURC,
        rampType: RampDirection.SELL
      })
    ).toBe(RampTransactionPreparationKind.OfframpNonBrl);
  });

  it("routes EURC onramps to Mykobo on every supported destination", () => {
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
