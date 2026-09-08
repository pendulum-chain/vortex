import { describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, mapFiatToDestination, Networks, RampDirection } from "@vortexfi/shared";
import { resolveBlockFlow } from "../flows/catalog";

function sellRequest(inputCurrency: string, outputCurrency: FiatToken) {
  return {
    from: Networks.Ethereum,
    inputAmount: "1",
    inputCurrency: inputCurrency as EvmToken,
    network: Networks.Ethereum,
    outputCurrency,
    rampType: RampDirection.SELL,
    to: mapFiatToDestination(outputCurrency)
  };
}

describe("SELL flow catalog with routed (Squid-discovered) source tokens", () => {
  // PAXG is absent from the static token config, and no dynamic token list is loaded in tests, so a
  // match here proves the catalog does not consult live token discovery. Persisted flows are
  // re-resolved at startup, when discovery may have fallen back to the static config.
  it("maps a routed EVM source token to the BRL, EUR, and Alfredpay offramp flows without live token discovery", () => {
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.BRL)).name).toBe("BrlOfframpBase");
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.EURC)).name).toBe("EurOfframpBase");
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.USD)).name).toBe("AlfredpayOfframp");
  });

  it("still rejects a fiat symbol as an on-chain SELL source", () => {
    expect(() => resolveBlockFlow(sellRequest(FiatToken.BRL, FiatToken.BRL))).toThrow(/No block flow mapped/);
  });
});
