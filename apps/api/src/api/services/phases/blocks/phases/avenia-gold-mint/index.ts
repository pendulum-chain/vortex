import { EvmToken, FiatToken, Networks, type RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { estimatePresignedExecutionFeeUsd } from "../../core/evm-destination-gas";
import { overrideFees } from "../../core/fees";
import type { Phase, PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { BrlaOnrampMintExecutor } from "../avenia-mint/execution";
import {
  type AveniaMintRegistrationFacts,
  type AveniaMintRegistrationInput,
  registerAveniaMint
} from "../avenia-mint/registration";
import { AveniaMintContext, type AveniaMintMetadata, simulateAveniaMint } from "../avenia-mint/simulation";
import { prepareAveniaMintTxs } from "../avenia-mint/transactions";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";

type FiatBrl = PhaseIO<typeof FiatToken.BRL, "fiat">;
type BaseBrla = PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>;

/** Sets the network fee `DistributeFees` deducts later: the Gold swap on Base. No Squid probe, which cannot price it. */
export async function simulateAveniaGoldMint(
  input: FiatBrl,
  ctx: PhaseCtx,
  estimateExecutionFeeUsd: typeof estimatePresignedExecutionFeeUsd = estimatePresignedExecutionFeeUsd
): Promise<PhaseResult<BaseBrla, AveniaMintMetadata>> {
  const result = await simulateAveniaMint(input, ctx);
  const swapFeeUsd = await estimateExecutionFeeUsd(Networks.Base, UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT);
  ctx.addNote(`AveniaGoldMint: swap execution ${swapFeeUsd} USD`);
  return {
    ...result,
    fees: await overrideFees(ctx, {
      anchor: {
        amount: new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString(),
        currency: FiatToken.BRL as RampCurrency
      },
      network: { amount: swapFeeUsd, currency: EvmToken.USDC as RampCurrency }
    })
  };
}

export const AveniaGoldMint: Phase<
  typeof AveniaMintContext,
  FiatBrl,
  BaseBrla,
  AveniaMintRegistrationFacts,
  AveniaMintRegistrationInput
> = {
  context: AveniaMintContext,
  executors: [new BrlaOnrampMintExecutor()],
  externalOperations: { register: { provider: "avenia" } },
  name: "AveniaGoldMint",
  phases: ["brlaOnrampMint"],
  // The BRLA is minted onto the ephemeral, so the order signs the BRL onramp's BRLA cleanup approval.
  prepareTxs: prepareAveniaMintTxs,
  register: registerAveniaMint,
  simulate: (input, ctx) => simulateAveniaGoldMint(input, ctx)
};
