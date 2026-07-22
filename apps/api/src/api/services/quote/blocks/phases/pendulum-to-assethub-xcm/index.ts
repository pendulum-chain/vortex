import {
  AssetHubToken,
  createPendulumToAssethubTransfer,
  EphemeralAccountType,
  EvmToken,
  encodeSubmittableExtrinsic,
  Networks,
  PENDULUM_USDC_ASSETHUB,
  RampCurrency
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { requireAccount } from "../../core/accounts";
import { defineContext } from "../../core/metadata";
import type { Phase, PhaseIO } from "../../core/types";
import { PendulumToAssethubXcmExecutor } from "./execution";

export interface PendulumToAssethubXcmMetadata {
  inputAmountRaw: string;
  outputAmountRaw: string;
  outputCurrencyId: typeof PENDULUM_USDC_ASSETHUB.currencyId;
}

export const PendulumToAssethubXcmContext = defineContext<PendulumToAssethubXcmMetadata>()("pendulumToAssethubXcm");

export const PendulumToAssethubXcm: Phase<
  typeof PendulumToAssethubXcmContext,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.AssetHub>
> = {
  context: PendulumToAssethubXcmContext,
  executors: [new PendulumToAssethubXcmExecutor()],
  name: "PendulumToAssethubXcm",
  phases: ["pendulumToAssethubXcm"],
  async prepareTxs(ctx) {
    if (!ctx.destinationAddress) throw new Error("PendulumToAssethubXcm requires destinationAddress");
    const substrate = requireAccount(ctx.accounts, EphemeralAccountType.Substrate);
    const tx = await createPendulumToAssethubTransfer(
      ctx.destinationAddress,
      ctx.ownMetadata.outputCurrencyId,
      ctx.ownMetadata.inputAmountRaw
    );
    return {
      intents: [
        {
          lane: "main",
          network: Networks.Pendulum,
          phase: "pendulumToAssethubXcm",
          signer: substrate.address,
          txData: encodeSubmittableExtrinsic(tx)
        }
      ]
    };
  },
  async simulate(input, ctx) {
    if (!ctx.fees?.usd || !ctx.fees.displayFiat) throw new Error("PendulumToAssethubXcm requires fees");
    const origin = "0.01";
    const destination = "0.018";
    const [originDisplay, destinationDisplay] = await Promise.all([
      priceFeedService.convertCurrency(origin, AssetHubToken.USDC as RampCurrency, ctx.fees.displayFiat.currency),
      priceFeedService.convertCurrency(destination, AssetHubToken.USDC as RampCurrency, ctx.fees.displayFiat.currency)
    ]);
    const extraUsd = new Big(origin).plus(destination);
    const extraDisplay = new Big(originDisplay).plus(destinationDisplay);
    ctx.fees.usd.network = new Big(ctx.fees.usd.network).plus(extraUsd).toString();
    ctx.fees.usd.total = new Big(ctx.fees.usd.total).plus(extraUsd).toFixed(2);
    ctx.fees.displayFiat.network = new Big(ctx.fees.displayFiat.network).plus(extraDisplay).toString();
    ctx.fees.displayFiat.total = new Big(ctx.fees.displayFiat.total).plus(extraDisplay).toFixed(2);
    const amount = input.amount.minus(extraUsd);
    const amountRaw = amount.times(new Big(10).pow(PENDULUM_USDC_ASSETHUB.decimals)).toFixed(0, 0);
    return {
      metadata: {
        inputAmountRaw: input.amountRaw,
        outputAmountRaw: amountRaw,
        outputCurrencyId: PENDULUM_USDC_ASSETHUB.currencyId
      },
      output: { amount, amountRaw, chain: Networks.AssetHub, token: AssetHubToken.USDC }
    };
  }
};
