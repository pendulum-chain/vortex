import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { BrlaApiService, EvmClientManager, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../config/vars";
import { priceFeedService } from "../../../priceFeed.service";
import { FlowBuilder } from "../core/flow";
import { fiatRequestIO } from "../core/io";
import type { Phase, PhaseCtx, PhaseIO } from "../core/types";
import { defineContext } from "../core/metadata";
import { AveniaStockMint } from "../phases/avenia-stock-mint";
import { prepareAveniaDirectMintTxs } from "../phases/avenia-direct-mint/transactions";
import { BrlaOnrampMintExecutor } from "../phases/avenia-mint/execution";
import { registerAveniaMint } from "../phases/avenia-mint/registration";
import { AveniaMintContext } from "../phases/avenia-mint/simulation";
import { simulateAveniaStockMint } from "../phases/avenia-stock-mint/simulation";

const DESTINATION = "0x1111111111111111111111111111111111111111";
const ETH_USD = 4000;
const BRL_PER_USD = 5;
const TARGET = config.stocks.gasReserveTargetWei;
const THRESHOLD = config.stocks.gasReserveThresholdWei;

afterEach(() => mock.restore());

function stubProviders() {
  spyOn(BrlaApiService, "getInstance").mockReturnValue({
    createPayInQuote: async ({ inputAmount }: { inputAmount: string }) => ({
      appliedFees: [],
      outputAmount: new Big(inputAmount).minus(1).toString()
    })
  } as never);
  spyOn(priceFeedService, "convertCurrency").mockImplementation(async (amount: string, from: string, to: string) => {
    const usd = from === "ETH" ? new Big(amount).mul(ETH_USD) : from === FiatToken.BRL ? new Big(amount).div(BRL_PER_USD) : new Big(amount);
    return (to === FiatToken.BRL ? usd.mul(BRL_PER_USD) : usd).toString();
  });
}

function ctx(request: Record<string, unknown> = {}): PhaseCtx {
  return {
    addNote() {},
    fees: {
      displayFiat: { anchor: "0", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "1", vortex: "1" },
      usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0.2", vortex: "0.2" }
    },
    notes: [],
    now: new Date("2026-11-05T00:00:00Z"),
    partner: null,
    priceEvmDestinationGas: false,
    request: {
      from: "pix",
      inputAmount: "500",
      inputCurrency: FiatToken.BRL,
      network: Networks.Robinhood,
      outputCurrency: EvmToken.NVDA,
      rampType: RampDirection.BUY,
      to: Networks.Robinhood,
      ...request
    }
  } as unknown as PhaseCtx;
}

const input = { amount: new Big(500), amountRaw: "500", chain: "fiat", token: FiatToken.BRL } as const;

function simulate(context: PhaseCtx, balance = 0n) {
  const getNativeBalance = mock(async () => balance);
  return {
    getNativeBalance,
    result: simulateAveniaStockMint(input, context, { estimateExecutionFeeUsd: async () => "0.40", getNativeBalance })
  };
}

describe("AveniaStockMint", () => {
  it("shares everything with AveniaDirectMint except its simulation", () => {
    expect(AveniaStockMint.context).toBe(AveniaMintContext);
    expect(AveniaStockMint.phases).toEqual(["brlaOnrampMint"]);
    expect(AveniaStockMint.executors?.[0]).toBeInstanceOf(BrlaOnrampMintExecutor);
    expect(AveniaStockMint.register).toBe(registerAveniaMint);
    expect(AveniaStockMint.prepareTxs).toBe(prepareAveniaDirectMintTxs);
    expect(AveniaStockMint.externalOperations).toEqual({ register: { provider: "avenia" } });
  });

  it("charges the 4663 swap budget and the reserve as the network fee, and the mint as the anchor fee", async () => {
    stubProviders();
    const context = ctx();
    const estimateExecutionFeeUsd = mock(async () => "0.40");

    const { fees, output } = await simulateAveniaStockMint(input, context, { estimateExecutionFeeUsd });

    // 5e13 wei at $4000 is $0.20.
    expect(estimateExecutionFeeUsd).toHaveBeenCalledWith(Networks.Robinhood, 1_300_000n);
    expect(fees?.usd?.network).toBe("0.6");
    expect(fees?.displayFiat?.network).toBe("3");
    expect(new Big(fees?.usd?.anchor ?? "0").gt(0)).toBe(true);
    expect(output).toMatchObject({ chain: Networks.Base, token: EvmToken.BRLA });
  });

  it("adds the destination transfer cost the flow priced", async () => {
    stubProviders();
    const context = ctx();
    context.priceEvmDestinationGas = true;
    context.evmDestinationGas = { executionFeeUsd: "0.02" } as PhaseCtx["evmDestinationGas"];

    const { fees } = await simulate(context).result;

    expect(fees?.usd?.network).toBe("0.62");
  });

  describe("gas reserve", () => {
    it("quotes the full target without an address, unbound to any wallet", async () => {
      stubProviders();
      const context = ctx();
      const { getNativeBalance, result } = simulate(context);
      await result;

      expect(getNativeBalance).not.toHaveBeenCalled();
      expect(context.gasReserve).toEqual({ amountRaw: TARGET.toString(), currency: "ETH", fiat: "1", usd: "0.2" });
    });

    it("tops an empty wallet up to the target, bound to that wallet", async () => {
      stubProviders();
      const context = ctx({ destinationAddress: DESTINATION });
      const { getNativeBalance, result } = simulate(context);
      await result;

      expect(getNativeBalance).toHaveBeenCalledWith(DESTINATION);
      expect(context.gasReserve).toMatchObject({ amountRaw: TARGET.toString(), quotedFor: DESTINATION });
    });

    it("quotes target minus balance below the threshold", async () => {
      stubProviders();
      const context = ctx({ destinationAddress: DESTINATION });
      await simulate(context, THRESHOLD - 1n).result;

      expect(context.gasReserve?.amountRaw).toBe((TARGET - THRESHOLD + 1n).toString());
    });

    it("quotes nothing at the threshold, still bound to the wallet, and charges no reserve", async () => {
      stubProviders();
      const context = ctx({ destinationAddress: DESTINATION });
      const { fees } = await simulate(context, THRESHOLD).result;

      expect(context.gasReserve).toEqual({ amountRaw: "0", currency: "ETH", fiat: "0", quotedFor: DESTINATION, usd: "0" });
      expect(fees?.usd?.network).toBe("0.4");
    });

    it("is off when the target is zero, whatever the wallet", async () => {
      stubProviders();
      const original = config.stocks.gasReserveTargetWei;
      config.stocks.gasReserveTargetWei = 0n;
      try {
        const context = ctx({ destinationAddress: DESTINATION });
        const { getNativeBalance, result } = simulate(context);
        await result;

        expect(getNativeBalance).not.toHaveBeenCalled();
        expect(context.gasReserve).toEqual({ amountRaw: "0", currency: "ETH", fiat: "0", usd: "0" });
      } finally {
        config.stocks.gasReserveTargetWei = original;
      }
    });
  });

  describe("in a flow", () => {
    const Tail: Phase<ReturnType<typeof tailContext>, PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>, PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>> = {
      context: tailContext(),
      name: "Tail",
      phases: [],
      simulate: async (io, phaseCtx) => ({ metadata: { sawReserve: phaseCtx.gasReserve?.amountRaw }, output: io })
    };
    function tailContext() {
      return defineContext<{ sawReserve?: string }>()("tail");
    }

    it("hands the reserve to later blocks and persists it in globals, using live fees and balance", async () => {
      stubProviders();
      const estimateFeesPerGas = mock(async () => ({ maxFeePerGas: 30_000_000n, maxPriorityFeePerGas: 0n }));
      const getBalance = mock(async () => 0n);
      spyOn(EvmClientManager, "getInstance").mockReturnValue({ getClient: () => ({ estimateFeesPerGas, getBalance }) } as never);
      const flow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaStockMint).pipe(Tail).build("AveniaStockMintFoldTest");
      const context = ctx({ destinationAddress: DESTINATION });
      context.evmDestinationGas = { executionFeeUsd: "0.02" } as PhaseCtx["evmDestinationGas"];

      const { metadata } = await flow.simulate(context);

      expect(getBalance).toHaveBeenCalledWith({ address: DESTINATION });
      expect(metadata.globals.gasReserve).toMatchObject({ amountRaw: TARGET.toString(), quotedFor: DESTINATION });
      expect(metadata.blocks.tail).toEqual({ sawReserve: TARGET.toString() });
    });

    it("leaves globals untouched for a flow without one", async () => {
      stubProviders();
      const flow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), {
        ...Tail,
        simulate: async (io: PhaseIO<typeof FiatToken.BRL, "fiat">) => ({ metadata: {}, output: io })
      }).build("NoReserveFoldTest");
      const context = ctx();
      context.evmDestinationGas = { executionFeeUsd: "0.02" } as PhaseCtx["evmDestinationGas"];

      const { metadata } = await flow.simulate(context);

      expect("gasReserve" in metadata.globals).toBe(false);
    });
  });
});
