import { afterAll, describe, expect, it, mock } from "bun:test";
import * as shared from "@vortexfi/shared";
import {
  EvmToken,
  type EvmTokenDetails,
  evmTokenConfig,
  FiatToken,
  mapFiatToDestination,
  Networks,
  RampDirection,
  TokenType
} from "@vortexfi/shared";
import { resolveBlockFlow } from "../flows/catalog";

// Snapshot before mock.module: bun mutates the imported namespace in place.
const sharedReal = { ...shared };

// A token that only exists in the Squid-discovered (dynamic) part of the token catalog.
const ROUTED_PAXG: EvmTokenDetails = {
  assetSymbol: "PAXG",
  decimals: 18,
  erc20AddressSourceChain: "0x45804880de22913dafe09f4980848ece6ecbaf78",
  isNative: false,
  network: Networks.Ethereum,
  pendulumRepresentative: (evmTokenConfig[Networks.Ethereum][EvmToken.USDC] as EvmTokenDetails).pendulumRepresentative,
  type: TokenType.Evm
};

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  getOnChainTokenDetails: (network: Networks, token: string, ...rest: unknown[]) =>
    network === Networks.Ethereum && token === "PAXG"
      ? ROUTED_PAXG
      : (sharedReal.getOnChainTokenDetails as (...args: unknown[]) => unknown)(network, token, ...rest)
}));

afterAll(() => {
  mock.module("@vortexfi/shared", () => sharedReal);
});

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
  it("maps a routed EVM source token to the BRL, EUR, and Alfredpay offramp flows", () => {
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.BRL)).name).toBe("BrlOfframpBase");
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.EURC)).name).toBe("EurOfframpBase");
    expect(resolveBlockFlow(sellRequest("PAXG", FiatToken.USD)).name).toBe("AlfredpayOfframp");
  });

  it("still rejects a source token unknown to the token catalog", () => {
    expect(() => resolveBlockFlow(sellRequest("NOPE", FiatToken.BRL))).toThrow(/No block flow mapped/);
  });
});
