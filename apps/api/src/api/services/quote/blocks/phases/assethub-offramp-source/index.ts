import {
  AssetHubToken,
  createAssethubToPendulumXCM,
  createPaseoToPendulumXCM,
  EPaymentMethod,
  encodeSubmittableExtrinsic,
  Networks,
  PENDULUM_USDC_ASSETHUB
} from "@vortexfi/shared";
import Big from "big.js";
import { config } from "../../../../../../config/vars";
import { defineContext } from "../../core/metadata";
import type { Phase, PhaseIO, RegisterCtx } from "../../core/types";

export interface AssethubOfframpSourceMetadata {
  inputAmountDecimal: string;
  inputAmountRaw: string;
  outputAmountDecimal: string;
  outputAmountRaw: string;
  xcmFees: {
    destination: { amount: string; amountRaw: string; currency: string };
    origin: { amount: string; amountRaw: string; currency: string };
  };
}

export interface AssethubOfframpSourceRegistrationInput extends Record<string, unknown> {
  walletAddress?: string;
}

export interface AssethubOfframpSourceRegistrationFacts {
  userAddress: string;
}

export const AssethubOfframpSourceContext = defineContext<AssethubOfframpSourceMetadata>()("assethubOfframpSource");

export const AssethubOfframpSource: Phase<
  typeof AssethubOfframpSourceContext,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.AssetHub>,
  PhaseIO<typeof AssetHubToken.USDC, typeof Networks.Pendulum>,
  AssethubOfframpSourceRegistrationFacts,
  AssethubOfframpSourceRegistrationInput
> = {
  context: AssethubOfframpSourceContext,
  name: "AssethubOfframpSource",
  phases: [],
  async prepareTxs(ctx) {
    const facts = ctx.ownRegistrationFacts;
    const substrate = ctx.accounts.Substrate;
    if (!facts || !substrate) throw new Error("AssethubOfframpSource requires user and Substrate accounts");
    const transaction = config.sandboxEnabled
      ? await createPaseoToPendulumXCM(substrate.address, "usdc", ctx.ownMetadata.inputAmountRaw)
      : await createAssethubToPendulumXCM(substrate.address, "usdc", ctx.ownMetadata.inputAmountRaw);
    return {
      intents: [
        {
          lane: "main",
          network: config.sandboxEnabled ? Networks.Paseo : Networks.AssetHub,
          phase: "assethubToPendulum",
          signer: facts.userAddress,
          txData: encodeSubmittableExtrinsic(transaction)
        }
      ],
      state: facts
    };
  },
  async register(ctx: RegisterCtx<AssethubOfframpSourceMetadata, AssethubOfframpSourceRegistrationInput>) {
    if (!ctx.input.walletAddress) throw new Error("User address must be provided for offramping.");
    return { facts: { userAddress: ctx.input.walletAddress } };
  },
  async simulate(input, ctx) {
    if (ctx.request.from !== Networks.AssetHub || ctx.request.to !== EPaymentMethod.PIX) {
      throw new Error("AssethubOfframpSource received an invalid corridor");
    }
    const feeRaw = new Big(20_000);
    const outputAmountRaw = new Big(input.amountRaw).minus(feeRaw).toFixed(0, 0);
    const outputAmount = new Big(outputAmountRaw).div(new Big(10).pow(PENDULUM_USDC_ASSETHUB.decimals));
    return {
      metadata: {
        inputAmountDecimal: input.amount.toString(),
        inputAmountRaw: input.amountRaw,
        outputAmountDecimal: outputAmount.toString(),
        outputAmountRaw,
        xcmFees: {
          destination: { amount: "0.01", amountRaw: "10000", currency: "USDC" },
          origin: { amount: "0.01", amountRaw: "10000", currency: "USDC" }
        }
      },
      output: { amount: outputAmount, amountRaw: outputAmountRaw, chain: Networks.Pendulum, token: AssetHubToken.USDC }
    };
  }
};
