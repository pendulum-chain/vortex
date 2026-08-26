import { describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import type { PhaseCtx } from "../core/types";
import { MONERIUM_EURE, MONERIUM_ISSUE_NETWORKS, simulateMoneriumIssue } from "../phases/monerium-issue/simulation";

const FEES = {
  displayFiat: { anchor: "1.25", currency: FiatToken.EURC, network: "0", partnerMarkup: "0", total: "1.25", vortex: "0" },
  usd: { anchor: "1.25", network: "0", partnerMarkup: "0", total: "1.25", vortex: "0" }
};

function context(): PhaseCtx {
  return {
    addNote: () => undefined,
    notes: [],
    now: new Date(),
    partner: null,
    request: {
      from: EPaymentMethod.SEPA,
      inputAmount: "100.5",
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Base
    }
  };
}

describe("MoneriumIssue simulation", () => {
  it("maps every Vortex-supported issue network to its Monerium chain", () => {
    expect(MONERIUM_ISSUE_NETWORKS).toEqual({
      [Networks.Arbitrum]: { chain: "arbitrum", eureAddress: "0x0c06cCF38114ddfc35e07427B9424adcca9F44F8" },
      [Networks.Base]: { chain: "base", eureAddress: "0xbf6e2966A9C3D99C9E4D069E04f7Bdb9C8aa762C" },
      [Networks.BaseSepolia]: {
        chain: "basesepolia",
        eureAddress: "0x29F37F6adCa168B79B8d9567eab9BE3fBF21db85"
      },
      [Networks.Ethereum]: { chain: "ethereum", eureAddress: "0x39b8B6385416f4cA36a20319F70D28621895279D" },
      [Networks.Polygon]: { chain: "polygon", eureAddress: "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6" },
      [Networks.PolygonAmoy]: { chain: "amoy", eureAddress: "0xeD5D0B6C5BEFfDd607639094397C223536B0Bae7" }
    });
  });

  it("subtracts the injected issue fee and emits 18-decimal EURE on fixed Base without provider reads", async () => {
    const calculateIssueFees = mock(async () => FEES);
    const result = await simulateMoneriumIssue(
      { amount: new Big("100.5"), amountRaw: "100.5", chain: "fiat", token: FiatToken.EURC },
      context(),
      Networks.Base,
      "1.25",
      calculateIssueFees as never
    );

    expect(result.output).toEqual({
      amount: new Big("99.25"),
      amountRaw: "99250000000000000000",
      chain: Networks.Base,
      token: MONERIUM_EURE
    });
    expect(result.metadata.issue).toMatchObject({
      fee: new Big("1.25"),
      inputAmountRaw: "100500000000000000000",
      outputAmountRaw: "99250000000000000000"
    });
    expect(calculateIssueFees).toHaveBeenCalledWith(expect.anything(), {
      anchor: { amount: "1.25", currency: FiatToken.EURC },
      network: { amount: "0", currency: EvmToken.USDC }
    });
  });

  it("rejects a fee that consumes the exact input", async () => {
    await expect(
      simulateMoneriumIssue(
        { amount: new Big("1"), amountRaw: "1", chain: "fiat", token: FiatToken.EURC },
        context(),
        Networks.Base,
        "1",
        mock(async () => FEES) as never
      )
    ).rejects.toThrow("greater than or equal to input amount");
  });

  it("emits EURe on the selected non-Base network", async () => {
    const result = await simulateMoneriumIssue(
      { amount: new Big("10"), amountRaw: "10", chain: "fiat", token: FiatToken.EURC },
      context(),
      Networks.Arbitrum,
      "0",
      mock(async () => FEES) as never
    );

    expect(result.output.chain).toBe(Networks.Arbitrum);
    expect(result.metadata.network).toBe(Networks.Arbitrum);
  });
});
