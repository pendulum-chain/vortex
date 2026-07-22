import { describe, expect, it } from "bun:test";
import { AssetHubToken, EPaymentMethod, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { QuoteService } from "../../index";
import { BRL_OFFRAMP_ASSETHUB_USDC } from "../../../phases/ramp-flow-definitions";
import { assemblePhaseFlow } from "../core/phase-flow";
import { brlOfframpAssethubUsdcFlow } from "../flows/brl-offramp-assethub-usdc";
import { resolveBlockFlow } from "../flows/catalog";
import { AssethubOfframpSource } from "../phases/assethub-offramp-source";

const REQUEST = {
  from: Networks.AssetHub,
  inputAmount: "100",
  inputCurrency: AssetHubToken.USDC,
  network: Networks.AssetHub,
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: EPaymentMethod.PIX
};

const CORE_PHASES: RampPhase[] = [
  "fundEphemeral",
  "distributeFees",
  "subsidizePreSwap",
  "nablaApprove",
  "nablaSwap",
  "subsidizePostSwap",
  "pendulumToMoonbeamXcm",
  "brlaPayoutOnBase"
];

describe("AssetHub USDC to BRL/PIX block flow", () => {
  it("preserves the production phase sequence and executor coverage", () => {
    expect(brlOfframpAssethubUsdcFlow.phases).toEqual(CORE_PHASES);
    expect(brlOfframpAssethubUsdcFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
    expect(assemblePhaseFlow(brlOfframpAssethubUsdcFlow)).toEqual(BRL_OFFRAMP_ASSETHUB_USDC);
  });

  it("resolves only persisted AssetHub USDC to PIX requests", () => {
    expect(resolveBlockFlow(REQUEST).name).toBe("BrlOfframpAssethubUsdc");
    expect(() => resolveBlockFlow({ ...REQUEST, inputCurrency: AssetHubToken.USDT })).toThrow("No block flow mapped");
    expect(() => resolveBlockFlow({ ...REQUEST, inputCurrency: AssetHubToken.DOT })).toThrow("No block flow mapped");
    expect(() => resolveBlockFlow({ ...REQUEST, outputCurrency: FiatToken.ARS, to: EPaymentMethod.CBU })).toThrow(
      "No block flow mapped"
    );
  });

  it("does not bypass the public quote kill switch", async () => {
    await expect(new QuoteService().createQuote(REQUEST)).rejects.toMatchObject({ status: 400 });
  });

  it("simulates the AssetHub XCM fee and Pendulum IO exactly", async () => {
    const result = await AssethubOfframpSource.simulate(
      { amount: new (await import("big.js")).default(100), amountRaw: "100000000", chain: Networks.AssetHub, token: AssetHubToken.USDC },
      {
        addNote() {},
        notes: [],
        now: new Date(),
        partner: null,
        request: REQUEST
      }
    );
    expect(result.output).toMatchObject({ amountRaw: "99980000", chain: Networks.Pendulum, token: AssetHubToken.USDC });
    expect(result.metadata.xcmFees).toEqual({
      destination: { amount: "0.01", amountRaw: "10000", currency: "USDC" },
      origin: { amount: "0.01", amountRaw: "10000", currency: "USDC" }
    });
  });
});
