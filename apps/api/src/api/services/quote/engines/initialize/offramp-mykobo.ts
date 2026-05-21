import {
  ERC20_EURC_BASE,
  ERC20_EURC_BASE_DECIMALS,
  EvmToken,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  multiplyByPowerOfTen,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { MYKOBO_BASE_NETWORK } from "../../../mykobo";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

export class OffRampInitializeMykoboEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampInitializeMykoboEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    await assignPreNablaContext(ctx);

    const req = ctx.request;

    const fromNetwork = getNetworkFromDestination(req.from);
    if (!fromNetwork) {
      throw new Error(`Invalid network for offramp source ${req.from}`);
    }

    if (fromNetwork !== MYKOBO_BASE_NETWORK) {
      throw new Error(`Mykobo offramp only supports ${MYKOBO_BASE_NETWORK} as source, got ${fromNetwork}`);
    }

    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, req.inputCurrency as OnChainToken);
    if (!inputTokenDetails || !isEvmTokenDetails(inputTokenDetails)) {
      throw new Error(`Mykobo offramp requires an EVM input token on Base, got ${req.inputCurrency}`);
    }

    const inputAmountDecimal = new Big(req.inputAmount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, inputTokenDetails.decimals).toFixed(0, 0);

    const isAlreadyEurc = inputTokenDetails.erc20AddressSourceChain.toLowerCase() === ERC20_EURC_BASE.toLowerCase();

    let outputAmountDecimal: Big;
    let outputAmountRaw: string;

    if (isAlreadyEurc) {
      outputAmountDecimal = inputAmountDecimal;
      outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, ERC20_EURC_BASE_DECIMALS).toFixed(0, 0);
    } else {
      const quoteRequest: EvmBridgeQuoteRequest = {
        amountDecimal: req.inputAmount,
        fromNetwork: MYKOBO_BASE_NETWORK,
        inputCurrency: req.inputCurrency as OnChainToken,
        outputCurrency: EvmToken.EURC as OnChainToken,
        rampType: req.rampType,
        toNetwork: MYKOBO_BASE_NETWORK
      };

      const bridgeQuote = await getEvmBridgeQuote(quoteRequest);
      outputAmountDecimal = bridgeQuote.outputAmountDecimal;
      outputAmountRaw = bridgeQuote.outputAmountRaw;
    }

    ctx.mykoboOffRamp = {
      currency: FiatToken.EURC,
      fee: Big(0),
      inputAmountDecimal,
      inputAmountRaw,
      outputAmountDecimal,
      outputAmountRaw
    };

    ctx.addNote?.(
      `OffRampInitializeMykoboEngine: input=${inputAmountDecimal.toString()} ${req.inputCurrency} -> ${outputAmountDecimal.toString()} EURC on Base`
    );
  }
}
