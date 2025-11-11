import { CreateQuoteRequest, Networks, RampDirection } from "@vortexfi/shared";
import { Big } from "big.js";
import { calculateEvmBridgeAndNetworkFee, EvmBridgeRequest, EvmBridgeResult } from "../../core/squidrouter";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface SquidRouterConfig {
  direction: RampDirection;
  skipNote: string;
}

export interface SquidRouterComputation {
  type: "moonbeam-to-evm" | "evm-to-evm" | "evm-to-moonbeam";
  data: SquidRouterData;
}

export interface SquidRouterData {
  amountRaw: string;
  fromNetwork: Networks;
  fromToken: `0x${string}`;
  toNetwork: Networks;
  toToken: `0x${string}`;
  inputAmountDecimal: Big;
  inputAmountRaw: string;
  outputDecimals: number;
}

export abstract class BaseSquidRouterEngine implements Stage {
  abstract readonly config: SquidRouterConfig;

  readonly key = StageKey.SquidRouter;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    this.validate(ctx);

    const computation = this.compute(ctx);

    const bridgeRequest = this.buildBridgeRequest(computation.data, request);

    const bridgeResult = await this.calculateBridge(bridgeRequest);

    this.assignContext(computation.type, ctx, bridgeResult, computation.data);

    this.addNote(computation.type, ctx, bridgeResult, computation.data);
  }

  protected abstract validate(ctx: QuoteContext): void;

  protected abstract compute(ctx: QuoteContext): SquidRouterComputation;

  private buildBridgeRequest(data: SquidRouterData, req: CreateQuoteRequest): EvmBridgeRequest {
    return {
      amountRaw: data.amountRaw,
      fromNetwork: data.fromNetwork,
      fromToken: data.fromToken,
      originalInputAmountForRateCalc: data.inputAmountRaw,
      rampType: req.rampType,
      toNetwork: data.toNetwork,
      toToken: data.toToken
    };
  }

  private async calculateBridge(bridgeRequest: EvmBridgeRequest): Promise<EvmBridgeResult> {
    return calculateEvmBridgeAndNetworkFee(bridgeRequest);
  }

  private assignContext(
    type: SquidRouterComputation["type"],
    ctx: QuoteContext,
    bridgeResult: EvmBridgeResult,
    data: SquidRouterData
  ): void {
    const baseMeta = {
      effectiveExchangeRate: bridgeResult.finalEffectiveExchangeRate,
      fromNetwork: data.fromNetwork,
      fromToken: data.fromToken,
      inputAmountDecimal: data.inputAmountDecimal,
      inputAmountRaw: data.inputAmountRaw,
      networkFeeUSD: bridgeResult.networkFeeUSD,
      outputAmountDecimal: bridgeResult.finalGrossOutputAmountDecimal,
      outputAmountRaw: new Big(bridgeResult.finalGrossOutputAmountDecimal)
        .times(new Big(10).pow(data.outputDecimals))
        .toFixed(0),
      toNetwork: data.toNetwork,
      toToken: data.toToken
    };

    if (type === "moonbeam-to-evm") {
      ctx.moonbeamToEvm = baseMeta;
    } else if (type === "evm-to-evm") {
      ctx.evmToEvm = baseMeta;
    } else if (type === "evm-to-moonbeam") {
      ctx.evmToMoonbeam = baseMeta;
    }
  }

  private addNote(
    type: SquidRouterComputation["type"],
    ctx: QuoteContext,
    bridgeResult: EvmBridgeResult,
    data: SquidRouterData
  ): void {
    const outputCurrency = ctx.request.outputCurrency;
    const toNetwork = data.toNetwork;
    const outputAmount = bridgeResult.finalGrossOutputAmountDecimal.toFixed();

    ctx.addNote?.(`${type}: output=${outputAmount} ${outputCurrency} on ${toNetwork}`);
  }
}
