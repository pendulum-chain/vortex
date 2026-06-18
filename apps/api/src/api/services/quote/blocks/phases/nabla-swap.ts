import { EvmTokenDetails, getOnChainTokenDetails, Networks } from "@vortexfi/shared";
import { Big } from "big.js";
import logger from "../../../../../config/logger";
import { priceFeedService } from "../../../priceFeed.service";
import { calculateNablaSwapOutputEvm } from "../../core/nabla";
import { evmIO } from "../core/io";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

export function NablaSwap<Chain extends ChainBrand, InToken extends TokenBrand, OutToken extends TokenBrand>(
  chain: Chain,
  inToken: InToken,
  outToken: OutToken
): Phase<PhaseIO<InToken, Chain>, PhaseIO<OutToken, Chain>> {
  return {
    name: `NablaSwap(${chain}/${inToken}->${outToken})`,
    phases: ["nablaApprove", "nablaSwap"],
    async simulate(input: PhaseIO<InToken, Chain>, ctx: PhaseCtx): Promise<PhaseIO<OutToken, Chain>> {
      const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inToken) as EvmTokenDetails;
      const outputTokenDetails = getOnChainTokenDetails(Networks.Base, outToken) as EvmTokenDetails;

      if (!inputTokenDetails || !outputTokenDetails) {
        throw new Error("NablaSwap: Could not find EVM token details for the requested tokens");
      }

      const deductibleFee = new Big(0);
      const inputAmountForSwap = new Big(input.amount).minus(deductibleFee).toString();
      const inputAmountForSwapRaw = new Big(inputAmountForSwap).times(new Big(10).pow(inputTokenDetails.decimals)).toFixed(0);

      const result = await calculateNablaSwapOutputEvm({
        inputAmountForSwap,
        inputTokenDetails,
        outputTokenDetails,
        rampType: ctx.request.rampType
      });

      let oraclePrice: Awaited<ReturnType<typeof priceFeedService.getOnchainOraclePrice>> | undefined;
      try {
        oraclePrice = await priceFeedService.getOnchainOraclePrice(ctx.request.outputCurrency);
      } catch (error) {
        logger.warn(
          `NablaSwap: Unable to fetch on-chain oracle price for ${ctx.request.outputCurrency}, proceeding without it. Error: ${error}`
        );
      }

      ctx.addNote(
        `NablaSwap: ${inputAmountForSwap} ${inToken} -> ${result.nablaOutputAmountDecimal.toFixed()} ${outToken} on ${chain}`
      );

      return evmIO(outToken, chain, result.nablaOutputAmountDecimal, result.nablaOutputAmountRaw, {
        ...input.meta,
        nablaSwapEvm: {
          effectiveExchangeRate: result.effectiveExchangeRate,
          inputAmountForSwapDecimal: inputAmountForSwap,
          inputAmountForSwapRaw,
          inputCurrency: inToken,
          inputDecimals: inputTokenDetails.decimals,
          inputToken: inputTokenDetails.erc20AddressSourceChain,
          oraclePrice: oraclePrice?.price,
          outputAmountDecimal: result.nablaOutputAmountDecimal,
          outputAmountRaw: result.nablaOutputAmountRaw,
          outputCurrency: outToken,
          outputDecimals: outputTokenDetails.decimals,
          outputToken: outputTokenDetails.erc20AddressSourceChain
        }
      });
    }
  };
}
