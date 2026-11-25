import { EvmToken, FiatToken, Networks, normalizeTokenSymbol } from "@vortexfi/shared";
import Big from "big.js";
import { FlowBuilder } from "../core/flow";
import { BASE_PAXG_DECIMALS, BASE_USDC_DECIMALS, GOLD_TOKEN } from "../core/gold-base";
import { evmIO, fiatRequestIO } from "../core/io";
import { assemblePhaseFlow } from "../core/phase-flow";
import type { PhaseCtx } from "../core/types";
import { AveniaGoldMint } from "../phases/avenia-gold-mint";
import { AveniaOfframpFee } from "../phases/avenia-offramp-fee";
import { AveniaOfframpPayout } from "../phases/avenia-offramp-payout";
import { DestinationTransfer } from "../phases/destination-transfer";
import { DistributeFees } from "../phases/distribute-fees";
import { FundEphemeral } from "../phases/fund-ephemeral";
import { GoldPaxgSource, GoldUsdcSource } from "../phases/gold-permit-source";
import { GoldSettlement } from "../phases/gold-settlement";
import { GoldSwapBuy, GoldSwapSell } from "../phases/gold-swap";
import { NablaSwap } from "../phases/nabla-swap";
import { OfframpSubsidizePost, SubsidizePost } from "../phases/subsidize-post";
import { SubsidizePre } from "../phases/subsidize-pre";

type BaseUsdc = typeof EvmToken.USDC;
type Base = typeof Networks.Base;

const rawAmount = (amount: Big, decimals: number) => amount.mul(new Big(10).pow(decimals)).toFixed(0, 0);

/** The seller's PAXG on Base. The quote gate has already refused an amount finer than one wei. */
function paxgSource(ctx: PhaseCtx) {
  if (ctx.request.network !== Networks.Base || normalizeTokenSymbol(ctx.request.inputCurrency) !== GOLD_TOKEN) {
    throw new Error(
      `Expected ${GOLD_TOKEN} on ${Networks.Base}, received ${ctx.request.inputCurrency} on ${ctx.request.network}`
    );
  }
  const amount = new Big(ctx.request.inputAmount);
  return evmIO(GOLD_TOKEN, Networks.Base, amount, rawAmount(amount, BASE_PAXG_DECIMALS));
}

/** The buyer's native USDC on Base. */
function usdcSource(ctx: PhaseCtx) {
  if (ctx.request.network !== Networks.Base || ctx.request.inputCurrency !== EvmToken.USDC) {
    throw new Error(`Expected USDC on ${Networks.Base}, received ${ctx.request.inputCurrency} on ${ctx.request.network}`);
  }
  const amount = new Big(ctx.request.inputAmount);
  return evmIO(EvmToken.USDC, Networks.Base, amount, rawAmount(amount, BASE_USDC_DECIMALS));
}

/** Pix to PAXG on Base: the BRL onramp up to USDC on Base, then the pinned pool instead of Squid. */
export const brlOnrampBaseGoldFlow = FlowBuilder.start(fiatRequestIO(FiatToken.BRL), AveniaGoldMint)
  .pipe(FundEphemeral(EvmToken.BRLA, Networks.Base))
  .pipe(SubsidizePre<typeof EvmToken.BRLA, Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.BRLA, EvmToken.USDC))
  .pipe(DistributeFees<BaseUsdc, Base>())
  .pipe(SubsidizePost<BaseUsdc, Base>({ routeValueProbe: false }))
  .pipe(GoldSwapBuy())
  .pipe(GoldSettlement())
  .pipe(DestinationTransfer<typeof GOLD_TOKEN, Base>())
  .build("BrlOnrampBaseGold", { isDirectTransfer: false });

/** PAXG on Base to Pix: one permit pulls the PAXG, the pinned pool sells it, then the BRL offramp from USDC on Base. */
export const brlOfframpBaseGoldFlow = FlowBuilder.start(paxgSource, FundEphemeral(GOLD_TOKEN, Networks.Base))
  .pipe(GoldPaxgSource())
  .pipe(GoldSwapSell())
  .pipe(DistributeFees<BaseUsdc, Base>())
  .pipe(SubsidizePre<BaseUsdc, Base>())
  .pipe(NablaSwap(Networks.Base, EvmToken.USDC, EvmToken.BRLA, { cleanup: false }))
  .pipe(AveniaOfframpFee<typeof EvmToken.BRLA, Base>())
  .pipe(OfframpSubsidizePost<typeof EvmToken.BRLA, Base>())
  .pipe(AveniaOfframpPayout)
  .build("BrlOfframpBaseGold");

/** Native USDC to PAXG, both on Base. No fiat provider takes part. */
export const baseUsdcGoldBuyFlow = FlowBuilder.start(usdcSource, FundEphemeral(EvmToken.USDC, Networks.Base))
  .pipe(GoldUsdcSource())
  .pipe(DistributeFees<BaseUsdc, Base>())
  .pipe(GoldSwapBuy())
  .pipe(GoldSettlement())
  .pipe(DestinationTransfer<typeof GOLD_TOKEN, Base>())
  .build("BaseUsdcGoldBuy", { isDirectTransfer: false });

/** PAXG to native USDC, both on Base. */
export const baseUsdcGoldSellFlow = FlowBuilder.start(paxgSource, FundEphemeral(GOLD_TOKEN, Networks.Base))
  .pipe(GoldPaxgSource())
  .pipe(GoldSwapSell())
  .pipe(DistributeFees<BaseUsdc, Base>())
  .pipe(SubsidizePre<BaseUsdc, Base>())
  .pipe(DestinationTransfer<BaseUsdc, Base>())
  .build("BaseUsdcGoldSell", { isDirectTransfer: false });

export const brlOnrampBaseGoldPhaseFlow = assemblePhaseFlow(brlOnrampBaseGoldFlow);
export const brlOfframpBaseGoldPhaseFlow = assemblePhaseFlow(brlOfframpBaseGoldFlow);
export const baseUsdcGoldBuyPhaseFlow = assemblePhaseFlow(baseUsdcGoldBuyFlow);
export const baseUsdcGoldSellPhaseFlow = assemblePhaseFlow(baseUsdcGoldSellFlow);
