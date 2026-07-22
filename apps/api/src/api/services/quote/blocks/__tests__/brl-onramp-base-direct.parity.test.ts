import { afterAll, describe, expect, it, mock } from "bun:test";
import { BrlaApiService, EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, RampPhase } from "@vortexfi/shared";
import * as feesNamespace from "../core/fees";
import { BRL_ONRAMP_BASE_DIRECT } from "../../../phases/ramp-flow-definitions";
import type { PhaseCtx } from "../core/types";

const feesReal = { ...feesNamespace };
const FEES = {
  displayFiat: { anchor: "1.5", currency: FiatToken.BRL, network: "0", partnerMarkup: "0", total: "1.8", vortex: "0.3" },
  usd: { anchor: "0.27", network: "0", partnerMarkup: "0", total: "0.324", vortex: "0.054" }
};
const calculateFeesMock = mock(async () => FEES);

mock.module("../core/fees", () => ({
  calculateFees: calculateFeesMock,
  computeFees: async (ctx: PhaseCtx) => {
    ctx.fees ??= FEES;
  }
}));

const { brlOnrampBaseDirectFlow, brlOnrampBaseDirectPhaseFlow } = await import("../flows/brl-onramp-base-direct");

afterAll(() => {
  mock.module("../core/fees", () => ({ ...feesReal }));
});

const CORE_PHASES: RampPhase[] = ["brlaOnrampMint", "fundEphemeral", "destinationTransfer"];

function buildCtx(): PhaseCtx {
  return {
    addNote: () => undefined,
    now: new Date(),
    notes: [],
    partner: null,
    request: {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.BRLA,
      rampType: RampDirection.BUY,
      to: Networks.Base
    }
  };
}

describe("BRL_ONRAMP_BASE_DIRECT block flow", () => {
  it("matches the production phase sequence and executor coverage", () => {
    expect(brlOnrampBaseDirectFlow.phases).toEqual(CORE_PHASES);
    expect(brlOnrampBaseDirectPhaseFlow).toEqual(BRL_ONRAMP_BASE_DIRECT);
    expect(brlOnrampBaseDirectFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });

  it("simulates the direct Avenia mint without swap or bridge deductions", async () => {
    BrlaApiService.getInstance = mock(() => ({
      createPayInQuote: mock(async (request: { inputCurrency: string }) => ({
        appliedFees: [{ amount: "0.2", type: "Gas Fee" }],
        outputAmount: request.inputCurrency === "BRL" ? "99" : "98.5",
        quoteToken: "mock-quote-token"
      }))
    })) as unknown as typeof BrlaApiService.getInstance;

    const result = await brlOnrampBaseDirectFlow.simulate(buildCtx());

    expect(result.output).toMatchObject({ amountRaw: "98300000000000000000", chain: Networks.Base, token: EvmToken.BRLA });
    expect(calculateFeesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        anchor: { amount: "1.5", currency: FiatToken.BRL },
        network: { amount: "0", currency: EvmToken.USDC }
      })
    );
    expect(result.metadata.globals.fees).toEqual(FEES);
    expect(Object.keys(result.metadata.blocks)).toEqual(["aveniaMint", "fundEphemeral", "destinationTransfer"]);
    expect(result.metadata.blocks.destinationTransfer.amountRaw).toBe("98300000000000000000");
  });
});
