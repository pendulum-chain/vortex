// Performs the Nabla swap on Pendulum using the inputAmountForSwap from InputPlannerEngine.
// Parity: wraps existing calculateNablaSwapOutput logic and determines nablaOutputCurrency by direction/destination.

import { AssetHubToken, EvmToken, FiatToken, RampCurrency, RampDirection } from "@packages/shared";
import { calculateNablaSwapOutput } from "../gross-output";
import { QuoteContext, Stage, StageKey } from "../types";
import { validateAmountLimits } from "../validation-helpers";

export class SwapEngine implements Stage {
  readonly key = StageKey.Swap;

  async execute(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // Determine nablaOutputCurrency based on ramp type and destination
    let nablaOutputCurrency: RampCurrency;

    if (req.rampType === RampDirection.BUY) {
      // On-Ramp: intermediate currency on Pendulum/Moonbeam
      if (req.to === "assethub") {
        nablaOutputCurrency = AssetHubToken.USDC; // Only USDC supported on Nabla DEX on Pendulum
      } else {
        nablaOutputCurrency = EvmToken.USDC; // Use USDC as intermediate for EVM destinations
      }
    } else {
      // Off-Ramp: fiat-representative token on Pendulum
      if (req.to === "pix") {
        nablaOutputCurrency = FiatToken.BRL;
      } else if (req.to === "sepa") {
        nablaOutputCurrency = FiatToken.EURC;
      } else if (req.to === "cbu") {
        nablaOutputCurrency = FiatToken.ARS;
      } else {
        throw new Error(`SwapEngine: Unsupported off-ramp destination: ${req.to}`);
      }
    }

    const inputAmountForSwap = ctx.preNabla.inputAmountForSwap?.toString() ?? req.inputAmount;

    const result = await calculateNablaSwapOutput({
      fromPolkadotDestination: req.from,
      inputAmountForSwap,
      inputCurrency: req.inputCurrency,
      nablaOutputCurrency,
      rampType: req.rampType,
      toPolkadotDestination: req.to
    });

    // SELL path: enforce max output fiat limit using Nabla output
    if (req.rampType === RampDirection.SELL) {
      validateAmountLimits(result.nablaOutputAmountDecimal, req.outputCurrency as FiatToken, "max", req.rampType);
    }

    ctx.nabla = {
      effectiveExchangeRate: result.effectiveExchangeRate,
      outputAmountDecimal: result.nablaOutputAmountDecimal,
      outputAmountRaw: result.nablaOutputAmountRaw,
      outputCurrency: nablaOutputCurrency
    };

    ctx.addNote?.(
      `SwapEngine: output=${result.nablaOutputAmountDecimal.toString()} ${String(nablaOutputCurrency)}, raw=${result.nablaOutputAmountRaw}`
    );
  }
}
