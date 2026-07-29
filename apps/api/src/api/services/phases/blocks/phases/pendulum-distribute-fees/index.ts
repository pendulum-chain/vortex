import { AssetHubToken, EvmToken, Networks, PENDULUM_USDC_ASSETHUB } from "@vortexfi/shared";
import Big from "big.js";
import type { Phase, PhaseIO } from "../../core/types";
import { DistributeFeesExecutor } from "../distribute-fees/execution";
import { DistributeFeesContext } from "../distribute-fees/simulation";
import { preparePendulumDistributeFeesTxs } from "./transactions";

export const PendulumDistributeFees: Phase<
  typeof DistributeFeesContext,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>
> = {
  context: DistributeFeesContext,
  executors: [new DistributeFeesExecutor()],
  name: "PendulumDistributeFees",
  phases: ["distributeFees"],
  prepareTxs: preparePendulumDistributeFeesTxs,
  async simulate(input, ctx) {
    if (!ctx.fees?.usd) throw new Error("PendulumDistributeFees: missing USD fees");
    const total = new Big(ctx.fees.usd.network).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup);
    const amount = input.amount.minus(total);
    const amountRaw = amount.times(new Big(10).pow(PENDULUM_USDC_ASSETHUB.decimals)).toFixed(0, 0);
    return {
      metadata: {
        anchorFeeUsd: ctx.fees.usd.anchor,
        network: Networks.Pendulum,
        networkFeeUsd: ctx.fees.usd.network,
        outputCurrencyId: PENDULUM_USDC_ASSETHUB.currencyId,
        outputDecimals: PENDULUM_USDC_ASSETHUB.decimals,
        partnerMarkupUsd: ctx.fees.usd.partnerMarkup,
        totalFeesUsd: total.toString(),
        vortexFeeUsd: ctx.fees.usd.vortex
      },
      output: { ...input, amount, amountRaw }
    };
  }
};

export const PendulumAssethubDistributeFees: Phase<
  typeof DistributeFeesContext,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.Pendulum>,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.Pendulum>
> = {
  context: DistributeFeesContext,
  executors: [new DistributeFeesExecutor()],
  name: "PendulumAssethubDistributeFees",
  phases: ["distributeFees"],
  prepareTxs: preparePendulumDistributeFeesTxs,
  async simulate(input, ctx) {
    if (!ctx.fees?.usd) throw new Error("PendulumAssethubDistributeFees: missing USD fees");
    const total = new Big(ctx.fees.usd.network).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup);
    const amount = input.amount.minus(total);
    const amountRaw = amount.times(new Big(10).pow(PENDULUM_USDC_ASSETHUB.decimals)).toFixed(0, 0);
    return {
      metadata: {
        anchorFeeUsd: ctx.fees.usd.anchor,
        network: Networks.Pendulum,
        networkFeeUsd: ctx.fees.usd.network,
        outputCurrencyId: PENDULUM_USDC_ASSETHUB.currencyId,
        outputDecimals: PENDULUM_USDC_ASSETHUB.decimals,
        partnerMarkupUsd: ctx.fees.usd.partnerMarkup,
        totalFeesUsd: total.toString(),
        vortexFeeUsd: ctx.fees.usd.vortex
      },
      output: { ...input, amount, amountRaw }
    };
  }
};
