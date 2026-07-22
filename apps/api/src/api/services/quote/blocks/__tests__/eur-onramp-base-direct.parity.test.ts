import { afterAll, describe, expect, it, mock } from "bun:test";
import {
  EPaymentMethod,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  MykoboApiService,
  Networks,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import * as squidrouterNamespace from "../../core/squidrouter";
import * as feesNamespace from "../core/fees";

const feesReal = { ...feesNamespace };
const squidrouterReal = { ...squidrouterNamespace };

const EXPECTED_FEES = {
  displayFiat: { anchor: "0.06", currency: FiatToken.EURC, network: "0", partnerMarkup: "0", total: "0.16", vortex: "0.1" },
  usd: { anchor: "0.06", network: "0", partnerMarkup: "0", total: "0.16", vortex: "0.1" }
};
const calculateBridgeFee = mock(async () => ({ networkFeeUSD: "99" }));
let feeOverride: unknown;

mock.module("../core/fees", () => ({
  calculateFees: async (_ctx: unknown, override: unknown) => {
    feeOverride = override;
    return EXPECTED_FEES;
  },
  computeFees: async (ctx: { fees?: unknown }) => {
    ctx.fees ??= EXPECTED_FEES;
  }
}));
mock.module("../../core/squidrouter", () => ({
  calculateEvmBridgeAndNetworkFee: calculateBridgeFee,
  getBridgeTargetTokenDetails: () => evmTokenConfig[Networks.Base][EvmToken.EURC]
}));

afterAll(() => {
  mock.module("../core/fees", () => ({ ...feesReal }));
  mock.module("../../core/squidrouter", () => ({ ...squidrouterReal }));
});

import { EUR_ONRAMP_BASE_DIRECT } from "../../../phases/ramp-flow-definitions";
import type { PhaseCtx } from "../core/types";
import { resolveBlockFlow } from "../flows/catalog";
import { eurOnrampBaseDirectFlow, eurOnrampBaseDirectPhaseFlow } from "../flows/eur-onramp-base-direct";

const CORE_PHASES: RampPhase[] = ["mykoboOnrampDeposit", "fundEphemeral", "destinationTransfer"];
const REQUEST = {
  from: EPaymentMethod.SEPA,
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  network: Networks.Base,
  outputCurrency: EvmToken.EURC,
  rampType: RampDirection.BUY,
  to: Networks.Base
};

function buildCtx(): PhaseCtx {
  return {
    addNote: () => undefined,
    fees: EXPECTED_FEES,
    notes: [],
    now: new Date(),
    partner: null,
    request: REQUEST
  };
}

describe("EUR_ONRAMP_BASE_DIRECT block flow", () => {
  it("matches the legacy phase flow and exact executor sequence", () => {
    expect(eurOnrampBaseDirectFlow.phases).toEqual(CORE_PHASES);
    expect(eurOnrampBaseDirectPhaseFlow).toEqual(EUR_ONRAMP_BASE_DIRECT);
    expect(eurOnrampBaseDirectFlow.executors.map(executor => executor.getPhaseName())).toEqual(CORE_PHASES);
  });

  it("simulates the provider-delivered EURC with zero direct network fee", async () => {
    MykoboApiService.getInstance = mock(() => ({
      defaultDepositFee: mock(async () => ({ total: "0.06" }))
    })) as unknown as typeof MykoboApiService.getInstance;

    const result = await eurOnrampBaseDirectFlow.simulate(buildCtx());

    expect(result.output).toMatchObject({ amountRaw: "99940000", chain: Networks.Base, token: EvmToken.EURC });
    expect(feeOverride).toEqual({
      anchor: { amount: "0.06", currency: FiatToken.EURC },
      network: { amount: "0", currency: EvmToken.USDC }
    });
    expect(calculateBridgeFee).not.toHaveBeenCalled();
    expect(Object.keys(result.metadata.blocks)).toEqual(["mykoboMint", "fundEphemeral", "destinationTransfer"]);
    expect(result.metadata.blocks.destinationTransfer.amountRaw).toBe("99940000");
  });

  it("uses the exact SEPA EUR to Base EURC catalog predicate", () => {
    expect(resolveBlockFlow(REQUEST).name).toBe("EurOnrampBaseDirect");
    expect(() => resolveBlockFlow({ ...REQUEST, from: EPaymentMethod.PIX })).toThrow();
    expect(resolveBlockFlow({ ...REQUEST, outputCurrency: EvmToken.USDC }).name).not.toBe("EurOnrampBaseDirect");
    expect(() => resolveBlockFlow({ ...REQUEST, rampType: RampDirection.SELL })).toThrow();
  });
});
