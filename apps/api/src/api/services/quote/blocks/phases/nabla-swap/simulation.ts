import { EvmTokenDetails, getOnChainTokenDetails, Networks, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import logger from "../../../../../../config/logger";
import { priceFeedService } from "../../../../priceFeed.service";
import { calculateNablaSwapOutputEvm } from "../../../core/nabla";
import { evmIO } from "../../core/io";
import { defineContext, type SerializableBig } from "../../core/metadata";
import type { ChainBrand, PhaseCtx, PhaseIO, PhaseResult, TokenBrand } from "../../core/types";

export interface NablaSwapMetadata {
  ammOutputAmountRaw?: string;
  effectiveExchangeRate?: string;
  inputAmountForSwapDecimal: string;
  inputAmountForSwapRaw: string;
  inputCurrency: string;
  inputCurrencyId?: ReturnType<typeof import("@vortexfi/shared").getPendulumDetails>["currencyId"];
  inputDecimals: number;
  inputToken: string;
  network?: string;
  oraclePrice?: SerializableBig;
  outputAmountDecimal: SerializableBig;
  outputAmountRaw: string;
  outputCurrency: string;
  outputCurrencyId?: ReturnType<typeof import("@vortexfi/shared").getPendulumDetails>["currencyId"];
  outputDecimals: number;
  outputToken: string;
}

export const NablaSwapContext = defineContext<NablaSwapMetadata>()("nablaSwap");

export async function simulateNablaSwap<Chain extends ChainBrand, InToken extends TokenBrand, OutToken extends TokenBrand>(
  chain: Chain,
  inToken: InToken,
  outToken: OutToken,
  input: PhaseIO<InToken, Chain>,
  ctx: PhaseCtx
): Promise<PhaseResult<PhaseIO<OutToken, Chain>, NablaSwapMetadata>> {
  const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inToken) as EvmTokenDetails;
  const outputTokenDetails = getOnChainTokenDetails(Networks.Base, outToken) as EvmTokenDetails;
  if (!inputTokenDetails || !outputTokenDetails) {
    throw new Error("NablaSwap: Could not find EVM token details for the requested tokens");
  }
  const inputAmountForSwap = new Big(input.amount).toString();
  const inputAmountForSwapRaw = new Big(inputAmountForSwap).times(new Big(10).pow(inputTokenDetails.decimals)).toFixed(0);
  const result = await calculateNablaSwapOutputEvm({
    inputAmountForSwap,
    inputTokenDetails,
    outputTokenDetails,
    rampType: ctx.request.rampType
  });
  const oracleCurrency = ctx.request.rampType === RampDirection.BUY ? ctx.request.inputCurrency : ctx.request.outputCurrency;
  let oraclePrice: Big | undefined;
  try {
    oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(oracleCurrency);
  } catch (error) {
    logger.warn(`NablaSwap: Unable to fetch oracle price for ${oracleCurrency}, proceeding without it. Error: ${error}`);
  }
  ctx.addNote(
    `NablaSwap: ${inputAmountForSwap} ${inToken} -> ${result.nablaOutputAmountDecimal.toFixed()} ${outToken} on ${chain}`
  );
  return {
    metadata: {
      effectiveExchangeRate: result.effectiveExchangeRate,
      inputAmountForSwapDecimal: inputAmountForSwap,
      inputAmountForSwapRaw,
      inputCurrency: inToken,
      inputDecimals: inputTokenDetails.decimals,
      inputToken: inputTokenDetails.erc20AddressSourceChain,
      oraclePrice,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: outToken,
      outputDecimals: outputTokenDetails.decimals,
      outputToken: outputTokenDetails.erc20AddressSourceChain
    },
    output: evmIO(outToken, chain, result.nablaOutputAmountDecimal, result.nablaOutputAmountRaw)
  };
}
