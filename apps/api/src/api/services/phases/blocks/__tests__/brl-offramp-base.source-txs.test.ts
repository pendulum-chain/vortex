import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { EphemeralAccountType, type EvmNetworks, EvmToken, evmTokenConfig, Networks } from "@vortexfi/shared";
import type { PrepareCtx } from "../core/types";
import type { EvmOfframpSourceRegistrationFacts } from "../phases/evm-offramp-source/registration";
import type { EvmOfframpSourceMetadata } from "../phases/evm-offramp-source/simulation";

const sharedReal = { ...sharedNamespace };
const routeRequests: Record<string, unknown>[] = [];

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  createOfframpSquidrouterTransactionsToEvm: async (request: Record<string, unknown>) => {
    routeRequests.push(request);
    return {
      approveData: { data: "0xa1", gasLimit: "100", target: "0x1111111111111111111111111111111111111111", value: "0" },
      swapData: { data: "0xa2", gasLimit: "200", target: "0x2222222222222222222222222222222222222222", value: "3" }
    };
  }
}));

const { prepareEvmOfframpSourceTxs } = await import("../phases/evm-offramp-source/transactions");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

const EPHEMERAL = "0x3333333333333333333333333333333333333333";
const USER = "0x4444444444444444444444444444444444444444";

function context(
  fromNetwork: EvmNetworks,
  fromToken: EvmToken
): PrepareCtx<EvmOfframpSourceMetadata, EvmOfframpSourceRegistrationFacts> {
  const details = evmTokenConfig[fromNetwork][fromToken];
  if (!details) throw new Error(`Missing ${fromToken} on ${fromNetwork}`);
  return {
    accounts: {
      [EphemeralAccountType.EVM]: { address: EPHEMERAL, type: EphemeralAccountType.EVM }
    },
    globals: {} as never,
    ownMetadata: {
      fromNetwork,
      fromToken: details.erc20AddressSourceChain,
      inputAmountDecimal: "100",
      inputAmountRaw: "100000000",
      network: Networks.Base,
      networkFeeUSD: "0",
      outputAmountDecimal: "100",
      outputAmountRaw: "100000000",
      toNetwork: Networks.Base,
      toToken: evmTokenConfig[Networks.Base][EvmToken.USDC]!.erc20AddressSourceChain,
      token: EvmToken.USDC
    },
    ownRegistrationFacts: { userAddress: USER },
    quote: {} as never
  };
}

describe("EVM offramp source transaction variants", () => {
  it("uses one user-wallet transfer for Base USDC", async () => {
    const prepared = await prepareEvmOfframpSourceTxs(context(Networks.Base, EvmToken.USDC));
    expect(prepared.intents.map(intent => intent.phase)).toEqual(["squidRouterNoPermitTransfer"]);
    expect(prepared.intents[0]?.signer).toBe(USER);
    expect(prepared.intents[0]?.network).toBe(Networks.Base);
  });

  it("uses user-wallet Squid approve/swap for another Base token", async () => {
    const prepared = await prepareEvmOfframpSourceTxs(context(Networks.Base, EvmToken.BRLA));
    expect(prepared.intents.map(intent => intent.phase)).toEqual(["squidRouterApprove", "squidRouterSwap"]);
    expect(prepared.intents.every(intent => intent.network === Networks.Base && intent.signer === USER)).toBe(true);
    expect(routeRequests.at(-1)).toMatchObject({ destinationAddress: EPHEMERAL, fromAddress: USER, fromNetwork: Networks.Base });
  });

  it("uses user-wallet Squid approve/swap on a cross-chain source", async () => {
    const prepared = await prepareEvmOfframpSourceTxs(context(Networks.Polygon, EvmToken.USDC));
    expect(prepared.intents.map(intent => intent.phase)).toEqual(["squidRouterApprove", "squidRouterSwap"]);
    expect(prepared.intents.every(intent => intent.network === Networks.Polygon && intent.signer === USER)).toBe(true);
    expect(routeRequests.at(-1)).toMatchObject({
      destinationAddress: EPHEMERAL,
      fromAddress: USER,
      fromNetwork: Networks.Polygon,
      toNetwork: Networks.Base
    });
  });
});
