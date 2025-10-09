import {
  getNetworkFromDestination,
  getPendulumDetails,
  multiplyByPowerOfTen,
  Networks,
  OnChainToken,
  RampCurrency,
  RampDirection,
  XcmFees
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { calculatePreNablaDeductibleFees } from "../../core/quote-fees";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface InitializeStageConfig {
  direction: RampDirection;
  skipNote: string;
}

export abstract class BaseInitializeEngine implements Stage {
  abstract readonly config: InitializeStageConfig;

  readonly key = StageKey.Initialize;

  async execute(ctx: QuoteContext): Promise<void> {
    const { direction, skipNote } = this.config;

    if (ctx.request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    await this.executeInternal(ctx);
  }

  protected abstract executeInternal(ctx: QuoteContext): Promise<void>;
}

export function assertContext<T>(value: T | undefined | null, message: string): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
}

export async function assignPreNablaContext(ctx: QuoteContext): Promise<void> {
  const req = ctx.request;

  const { preNablaDeductibleFeeAmount: deductibleFeeAmountInFeeCurrency, feeCurrency } = await calculatePreNablaDeductibleFees(
    req.inputAmount,
    req.inputCurrency,
    req.outputCurrency,
    req.rampType,
    req.from,
    req.to,
    ctx.partner?.id || undefined
  );

  const fromNetwork = getNetworkFromDestination(req.from);
  if (!fromNetwork) {
    throw new APIError({ message: `Invalid source network: ${req.from}`, status: httpStatus.BAD_REQUEST });
  }

  const representativeCurrency = getPendulumDetails(req.inputCurrency, fromNetwork).currency;

  const deductibleFeeAmountInSwapCurrency = await priceFeedService.convertCurrency(
    deductibleFeeAmountInFeeCurrency.toString(),
    feeCurrency,
    representativeCurrency
  );

  ctx.preNabla = {
    deductibleFeeAmountInFeeCurrency,
    deductibleFeeAmountInSwapCurrency: new Big(deductibleFeeAmountInSwapCurrency),
    feeCurrency,
    representativeInputCurrency: representativeCurrency
  };
}

export function buildXcmMeta(): XcmFees {
  return {
    destination: { amount: "0.01", amountRaw: "10000", currency: "USDC" },
    origin: { amount: "0.01", amountRaw: "10000", currency: "USDC" }
  };
}

export async function assignAssethubToPendulumXcm(ctx: QuoteContext, xcmFees: XcmFees): Promise<void> {
  const req = ctx.request;

  const fromToken = req.inputCurrency as OnChainToken;
  const fromTokenDecimals = getPendulumDetails(fromToken, Networks.AssetHub).decimals;
  const inputAmountDecimal = new Big(req.inputAmount);
  const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, fromTokenDecimals).toFixed(0);

  // Calculate gross output after subtracting XCM fees
  const originFeeInTargetCurrency = await priceFeedService.convertCurrency(
    xcmFees.origin.amount,
    xcmFees.origin.currency as RampCurrency,
    req.inputCurrency
  );
  const destinationFeeInTargetCurrency = await priceFeedService.convertCurrency(
    xcmFees.destination.amount,
    xcmFees.destination.currency as RampCurrency,
    req.inputCurrency
  );

  const outputAmountDecimal = inputAmountDecimal.minus(originFeeInTargetCurrency).minus(destinationFeeInTargetCurrency);
  const outputAmountRaw = multiplyByPowerOfTen(outputAmountDecimal, fromTokenDecimals).toFixed(0);

  ctx.assethubToPendulumXcm = {
    fromToken,
    inputAmountDecimal,
    inputAmountRaw,
    outputAmountDecimal,
    outputAmountRaw,
    toToken: fromToken, // Input and output token are the same for XCM transfer
    xcmFees
  };
}

export async function assignMoonbeamToPendulumXcm(
  ctx: QuoteContext,
  xcmFees: XcmFees,
  inputAmountDecimal: Big,
  inputAmountRaw: string
): Promise<void> {
  ctx.moonbeamToPendulumXcm = {
    fromToken: ctx.request.inputCurrency,
    inputAmountDecimal,
    inputAmountRaw,
    outputAmountDecimal: inputAmountDecimal,
    outputAmountRaw: inputAmountRaw,
    toToken: ctx.request.inputCurrency,
    xcmFees
  };
}
