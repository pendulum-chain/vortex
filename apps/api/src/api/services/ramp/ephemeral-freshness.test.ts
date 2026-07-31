import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { EphemeralAccountType, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import * as sharedNamespace from "@vortexfi/shared";
import { APIError } from "../../errors/api-error";

// Value copy taken before mock.module runs; restored in afterAll because bun
// module mocks are process-wide and would poison later test files.
const sharedReal = { ...sharedNamespace };

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

const SUBSTRATE_ADDR = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
const EVM_ADDR = "0x1111111111111111111111111111111111111111";

let substrateNonce = 0;
let substrateFree = "0";
let checkedSubstrateNetworks: string[] = [];
let evmNonce = 0;
let evmBalance = 0n;
let checkedEvmNetworks: string[] = [];
let evmGetClientShouldThrow = false;

mock.module("@vortexfi/shared", () => {
  const actual = require("@vortexfi/shared");
  return {
    ...actual,
    ApiManager: {
      getInstance: () => ({
        getApi: async (network: string) => {
          checkedSubstrateNetworks.push(network);
          return {
            api: {
              query: {
                system: {
                  account: async (_address: string) => ({
                    data: { free: { toString: () => substrateFree } },
                    nonce: { toNumber: () => substrateNonce }
                  })
                }
              }
            }
          };
        }
      })
    },
    EvmClientManager: {
      getInstance: () => ({
        getClient: (network: string) => {
          if (evmGetClientShouldThrow) throw new Error("RPC down");
          checkedEvmNetworks.push(network);
          return {
            getBalance: async (_args: { address: string }) => evmBalance,
            getTransactionCount: async (_args: { address: string }) => evmNonce
          };
        }
      })
    }
  };
});

// Import AFTER mocks are registered so the module picks up the mocked deps.
const { validateEphemeralAccountsFresh, quoteToSigningNetworks } = await import("./ephemeral-freshness");

// Minimal quotes per corridor. Only the fields quoteToSigningNetworks reads are set.
const BRL_OFFRAMP_EVM = {
  from: Networks.Base,
  inputCurrency: "USDC",
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: "pix"
};
const BRL_OFFRAMP_ASSETHUB = { ...BRL_OFFRAMP_EVM, from: Networks.AssetHub };
const ALFREDPAY_OFFRAMP = {
  from: Networks.Polygon,
  inputCurrency: "USDT",
  outputCurrency: FiatToken.MXN,
  rampType: RampDirection.SELL,
  to: "spei"
};
const AVENIA_ONRAMP_BASE = {
  from: "pix",
  inputCurrency: FiatToken.BRL,
  outputCurrency: "USDC",
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const AVENIA_ONRAMP_TO_POLYGON = { ...AVENIA_ONRAMP_BASE, to: Networks.Polygon };
const AVENIA_ONRAMP_ASSETHUB_USDC = { ...AVENIA_ONRAMP_BASE, outputCurrency: "USDC", to: Networks.AssetHub };
const AVENIA_ONRAMP_ASSETHUB_NON_USDC = { ...AVENIA_ONRAMP_BASE, outputCurrency: "DOT", to: Networks.AssetHub };
const ALFREDPAY_ONRAMP = {
  from: "spei",
  inputCurrency: FiatToken.MXN,
  outputCurrency: "USDT",
  rampType: RampDirection.BUY,
  to: Networks.Polygon
};
const ALFREDPAY_ONRAMP_TO_BASE = { ...ALFREDPAY_ONRAMP, to: Networks.Base };
const EUR_OFFRAMP = {
  from: Networks.Base,
  inputCurrency: "USDC",
  outputCurrency: FiatToken.EURC,
  rampType: RampDirection.SELL,
  to: "sepa"
};
const EUR_ONRAMP_BASE = {
  from: "sepa",
  inputCurrency: FiatToken.EURC,
  outputCurrency: "USDC",
  rampType: RampDirection.BUY,
  to: Networks.Base
};
const EUR_ONRAMP_TO_ARBITRUM = { ...EUR_ONRAMP_BASE, to: Networks.Arbitrum };

describe("quoteToSigningNetworks", () => {
  it("BRL off-ramp from an EVM chain signs on Base only", () => {
    expect(quoteToSigningNetworks(BRL_OFFRAMP_EVM)).toEqual({ evm: [Networks.Base], substrate: [] });
  });

  it("BRL off-ramp from AssetHub signs the Substrate ephemeral on Pendulum only", () => {
    expect(quoteToSigningNetworks(BRL_OFFRAMP_ASSETHUB)).toEqual({ evm: [], substrate: ["pendulum"] });
  });

  it("Alfredpay off-ramp signs on Polygon only", () => {
    expect(quoteToSigningNetworks(ALFREDPAY_OFFRAMP)).toEqual({ evm: [Networks.Polygon], substrate: [] });
  });

  it("Avenia on-ramp to Base signs on Base only (destination deduped against the hub)", () => {
    expect(quoteToSigningNetworks(AVENIA_ONRAMP_BASE)).toEqual({ evm: [Networks.Base], substrate: [] });
  });

  it("Avenia on-ramp to a different EVM chain signs on Base plus the destination", () => {
    expect(quoteToSigningNetworks(AVENIA_ONRAMP_TO_POLYGON)).toEqual({
      evm: [Networks.Base, Networks.Polygon],
      substrate: []
    });
  });

  it("Avenia on-ramp to AssetHub (USDC) signs Moonbeam + Pendulum, without Hydration", () => {
    expect(quoteToSigningNetworks(AVENIA_ONRAMP_ASSETHUB_USDC)).toEqual({
      evm: [Networks.Moonbeam],
      substrate: ["pendulum"]
    });
  });

  it("Avenia on-ramp to AssetHub (non-USDC) additionally signs Hydration", () => {
    expect(quoteToSigningNetworks(AVENIA_ONRAMP_ASSETHUB_NON_USDC)).toEqual({
      evm: [Networks.Moonbeam],
      substrate: ["pendulum", "hydration"]
    });
  });

  it("Alfredpay on-ramp signs on Polygon only (destination deduped)", () => {
    expect(quoteToSigningNetworks(ALFREDPAY_ONRAMP)).toEqual({ evm: [Networks.Polygon], substrate: [] });
  });

  it("Alfredpay on-ramp to a different EVM chain signs on Polygon plus the destination", () => {
    expect(quoteToSigningNetworks(ALFREDPAY_ONRAMP_TO_BASE)).toEqual({
      evm: [Networks.Polygon, Networks.Base],
      substrate: []
    });
  });

  it("EUR off-ramp signs on Base only", () => {
    expect(quoteToSigningNetworks(EUR_OFFRAMP)).toEqual({ evm: [Networks.Base], substrate: [] });
  });

  it("EUR on-ramp to Base signs on Base only (destination deduped)", () => {
    expect(quoteToSigningNetworks(EUR_ONRAMP_BASE)).toEqual({ evm: [Networks.Base], substrate: [] });
  });

  it("EUR on-ramp to a different EVM chain signs on Base plus the destination", () => {
    expect(quoteToSigningNetworks(EUR_ONRAMP_TO_ARBITRUM)).toEqual({
      evm: [Networks.Base, Networks.Arbitrum],
      substrate: []
    });
  });

  it("covers every branch of the mapping", () => {
    // Guard against a corridor being added to quoteToSigningNetworks without a test:
    // each case above must exercise a distinct branch, and together they must produce
    // every network the mapping can emit.
    const emitted = new Set(
      [
        BRL_OFFRAMP_EVM,
        BRL_OFFRAMP_ASSETHUB,
        ALFREDPAY_OFFRAMP,
        EUR_OFFRAMP,
        AVENIA_ONRAMP_BASE,
        AVENIA_ONRAMP_TO_POLYGON,
        AVENIA_ONRAMP_ASSETHUB_USDC,
        AVENIA_ONRAMP_ASSETHUB_NON_USDC,
        ALFREDPAY_ONRAMP,
        ALFREDPAY_ONRAMP_TO_BASE,
        EUR_ONRAMP_BASE,
        EUR_ONRAMP_TO_ARBITRUM
      ].flatMap(quote => {
        const { evm, substrate } = quoteToSigningNetworks(quote);
        return [...evm, ...substrate];
      })
    );
    expect([...emitted].sort() as string[]).toEqual(
      ([Networks.Arbitrum, Networks.Base, Networks.Moonbeam, Networks.Polygon, "hydration", "pendulum"] as string[]).sort()
    );
  });

  it("does not depend on chains outside the route (no all-chain fan-out)", () => {
    // The whole point of SPEC-015: a BRL-on-Base ramp must not touch Arbitrum/Avalanche/etc.
    const { evm } = quoteToSigningNetworks(BRL_OFFRAMP_EVM);
    expect(evm).not.toContain(Networks.Arbitrum);
    expect(evm).not.toContain(Networks.Ethereum);
    expect(evm.length).toBe(1);
  });
});

describe("validateEphemeralAccountsFresh", () => {
  beforeEach(() => {
    substrateNonce = 0;
    substrateFree = "0";
    checkedSubstrateNetworks = [];
    evmNonce = 0;
    evmBalance = 0n;
    checkedEvmNetworks = [];
    evmGetClientShouldThrow = false;
  });

  it("passes when the submitted ephemeral is fresh on the route's chains", async () => {
    await expect(
      validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR }, BRL_OFFRAMP_EVM)
    ).resolves.toBeUndefined();
    expect(checkedEvmNetworks).toEqual([Networks.Base]);
  });

  it("only checks the chains the route actually signs on", async () => {
    await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR }, ALFREDPAY_OFFRAMP);
    expect(checkedEvmNetworks).toEqual([Networks.Polygon]);
  });

  it("checks Hydration for a non-USDC AssetHub on-ramp", async () => {
    await validateEphemeralAccountsFresh({ [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR }, AVENIA_ONRAMP_ASSETHUB_NON_USDC);
    expect(checkedSubstrateNetworks).toEqual(["pendulum", "hydration"]);
  });

  it("does not check an ephemeral on chains the route never uses", async () => {
    // A Substrate ephemeral submitted for a Base off-ramp is unused → not checked.
    await validateEphemeralAccountsFresh(
      { [EphemeralAccountType.EVM]: EVM_ADDR, [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
      BRL_OFFRAMP_EVM
    );
    expect(checkedEvmNetworks).toEqual([Networks.Base]);
    expect(checkedSubstrateNetworks).toEqual([]);
  });

  it("passes when no ephemerals are submitted", async () => {
    await expect(validateEphemeralAccountsFresh({}, BRL_OFFRAMP_EVM)).resolves.toBeUndefined();
  });

  it("rejects non-fresh Substrate (non-zero nonce)", async () => {
    substrateNonce = 1;
    const err = await validateEphemeralAccountsFresh(
      { [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
      BRL_OFFRAMP_ASSETHUB
    ).catch(e => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).status).toBe(400);
    expect((err as APIError).message).toContain("not fresh");
  });

  it("rejects non-fresh Substrate (non-zero free balance)", async () => {
    substrateFree = "1000";
    const err = await validateEphemeralAccountsFresh(
      { [EphemeralAccountType.Substrate]: SUBSTRATE_ADDR },
      BRL_OFFRAMP_ASSETHUB
    ).catch(e => e);
    expect((err as APIError).status).toBe(400);
  });

  it("rejects non-fresh EVM (non-zero nonce)", async () => {
    evmNonce = 5;
    const err = await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR }, BRL_OFFRAMP_EVM).catch(e => e);
    expect((err as APIError).status).toBe(400);
    expect((err as APIError).message).toContain("not fresh");
  });

  it("rejects a nonce-0 EVM account that already holds a native balance (SPEC-015)", async () => {
    evmNonce = 0;
    evmBalance = 1_000_000_000n;
    const err = await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR }, BRL_OFFRAMP_EVM).catch(e => e);
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).status).toBe(400);
    expect((err as APIError).message).toContain("balance=1000000000");
  });

  it("fails closed with SERVICE_UNAVAILABLE on RPC error", async () => {
    evmGetClientShouldThrow = true;
    const err = await validateEphemeralAccountsFresh({ [EphemeralAccountType.EVM]: EVM_ADDR }, BRL_OFFRAMP_EVM).catch(e => e);
    expect((err as APIError).status).toBe(503);
  });
});
