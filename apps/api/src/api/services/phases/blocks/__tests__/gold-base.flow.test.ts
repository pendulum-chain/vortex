import { describe, expect, it } from "bun:test";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, type RampPhase } from "@vortexfi/shared";
import { GOLD_TOKEN } from "../core/gold-base";
import { getBlockExecutorFlows, getBlockFlowByIdentity, resolveBlockFlow, resolvePersistedBlockFlow } from "../flows/catalog";
import {
  baseUsdcGoldBuyFlow,
  baseUsdcGoldBuyPhaseFlow,
  baseUsdcGoldSellFlow,
  baseUsdcGoldSellPhaseFlow,
  brlOfframpBaseGoldFlow,
  brlOfframpBaseGoldPhaseFlow,
  brlOnrampBaseGoldFlow,
  brlOnrampBaseGoldPhaseFlow
} from "../flows/gold-base";
import { GoldPermitTransferExecutor } from "../phases/gold-permit-source";
import { GoldSettlementExecutor } from "../phases/gold-settlement/execution";
import { StockPermitTransferExecutor } from "../phases/stock-permit-source/execution";
import { GoldPermitSourceContext, StockPermitSourceContext } from "../phases/stock-permit-source/simulation";

const paxg = GOLD_TOKEN as EvmToken;
const pix = { network: Networks.Base, inputAmount: "1" };
const ROUTES: Array<{
  contextKeys: string[];
  flow: typeof brlOnrampBaseGoldFlow | typeof brlOfframpBaseGoldFlow | typeof baseUsdcGoldBuyFlow | typeof baseUsdcGoldSellFlow;
  name: string;
  phaseFlow: string[];
  phases: RampPhase[];
  request: Parameters<typeof resolveBlockFlow>[0];
}> = [
  {
    contextKeys: [
      "aveniaMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "goldSwap",
      "goldSettlement",
      "destinationTransfer"
    ],
    flow: brlOnrampBaseGoldFlow,
    name: "BrlOnrampBaseGold",
    phaseFlow: brlOnrampBaseGoldPhaseFlow,
    phases: [
      "brlaOnrampMint",
      "fundEphemeral",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "distributeFees",
      "subsidizePostSwap",
      "uniswapApprove",
      "uniswapSwap",
      "goldSettlementTopUp",
      "destinationTransfer"
    ],
    request: { ...pix, from: EPaymentMethod.PIX, inputCurrency: FiatToken.BRL, outputCurrency: paxg, rampType: RampDirection.BUY, to: Networks.Base }
  },
  {
    contextKeys: [
      "fundEphemeral",
      "goldPermitSource",
      "goldSwap",
      "distributeFees",
      "subsidizePreSwap",
      "nablaSwap",
      "aveniaOfframpFee",
      "subsidizePostSwap",
      "aveniaOfframpPayout"
    ],
    flow: brlOfframpBaseGoldFlow,
    name: "BrlOfframpBaseGold",
    phaseFlow: brlOfframpBaseGoldPhaseFlow,
    phases: [
      "fundEphemeral",
      "goldPermitTransfer",
      "uniswapApprove",
      "uniswapSwap",
      "distributeFees",
      "subsidizePreSwap",
      "nablaApprove",
      "nablaSwap",
      "subsidizePostSwap",
      "brlaPayoutOnBase"
    ],
    request: { ...pix, from: Networks.Base, inputCurrency: paxg, outputCurrency: FiatToken.BRL, rampType: RampDirection.SELL, to: EPaymentMethod.PIX }
  },
  {
    contextKeys: ["fundEphemeral", "goldPermitSource", "distributeFees", "goldSwap", "goldSettlement", "destinationTransfer"],
    flow: baseUsdcGoldBuyFlow,
    name: "BaseUsdcGoldBuy",
    phaseFlow: baseUsdcGoldBuyPhaseFlow,
    phases: [
      "fundEphemeral",
      "goldPermitTransfer",
      "distributeFees",
      "uniswapApprove",
      "uniswapSwap",
      "goldSettlementTopUp",
      "destinationTransfer"
    ],
    request: { ...pix, from: Networks.Base, inputCurrency: EvmToken.USDC, outputCurrency: paxg, rampType: RampDirection.BUY, to: Networks.Base }
  },
  {
    contextKeys: ["fundEphemeral", "goldPermitSource", "goldSwap", "distributeFees", "subsidizePreSwap", "destinationTransfer"],
    flow: baseUsdcGoldSellFlow,
    name: "BaseUsdcGoldSell",
    phaseFlow: baseUsdcGoldSellPhaseFlow,
    phases: [
      "fundEphemeral",
      "goldPermitTransfer",
      "uniswapApprove",
      "uniswapSwap",
      "distributeFees",
      "subsidizePreSwap",
      "destinationTransfer"
    ],
    request: { ...pix, from: Networks.Base, inputCurrency: paxg, outputCurrency: EvmToken.USDC, rampType: RampDirection.SELL, to: Networks.Base }
  }
];

describe.each(ROUTES.map(route => [route.name, route] as const))("Gold flow %s", (name, route) => {
  const { contextKeys, flow, phaseFlow, phases, request } = route;
  it("derives its phases, one executor each, and the phase flow", () => {
    expect(flow.name).toBe(name);
    expect(flow.phases).toEqual(phases);
    expect(flow.executors.map(executor => executor.getPhaseName())).toEqual(phases);
    expect(phaseFlow).toEqual(["initial", ...phases, "complete"]);
  });

  it("owns one context per block", () => {
    expect(flow.contextKeys).toEqual(contextKeys);
  });

  it("is registered, found again by identity, and resolved fresh and persisted", () => {
    expect(getBlockExecutorFlows()).toContain(flow);
    expect(getBlockFlowByIdentity(flow.identity)).toBe(flow);
    expect(resolveBlockFlow(request)).toBe(flow);
    const persisted = {
      blocks: Object.fromEntries(flow.contextKeys.map(key => [key, {}])),
      flow: flow.identity,
      globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } }, partner: null, request }
    };
    expect(resolvePersistedBlockFlow(persisted).identity).toEqual(flow.identity);
  });
});

describe("Gold executors", () => {
  it("runs the permit source under Gold's own phase, apart from the stocks' executor", () => {
    expect(new GoldPermitTransferExecutor().getPhaseName()).toBe("goldPermitTransfer");
    expect(new StockPermitTransferExecutor().getPhaseName()).toBe("stockPermitTransfer");
    expect(GoldPermitSourceContext.key).toBe("goldPermitSource");
    expect(StockPermitSourceContext.key).toBe("stockPermitSource");
  });

  it("uses one executor class per Gold phase across the four flows", () => {
    const executors = ROUTES.flatMap(route => route.flow.executors);
    const classOf = (phase: string) => new Set(executors.filter(e => e.getPhaseName() === phase).map(e => e.constructor));
    expect([...classOf("goldPermitTransfer")]).toEqual([GoldPermitTransferExecutor]);
    expect([...classOf("goldSettlementTopUp")]).toEqual([GoldSettlementExecutor]);
  });
});
