import {
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  createNablaTransactionsForOnramp,
  EphemeralAccountType,
  EvmToken,
  encodeSubmittableExtrinsic,
  FiatToken,
  getPendulumDetails,
  Networks,
  PENDULUM_USDC_ASSETHUB
} from "@vortexfi/shared";
import Big from "big.js";
import { priceFeedService } from "../../../../priceFeed.service";
import { preparePendulumCleanupTransaction } from "../../../../transactions/pendulum/cleanup";
import { calculateNablaSwapOutput } from "../../../core/nabla";
import { requireAccount } from "../../core/accounts";
import type { Phase, PhaseIO } from "../../core/types";
import { NablaApproveExecutor, NablaSwapExecutor } from "../nabla-swap/execution";
import { NablaSwapContext } from "../nabla-swap/simulation";

export const PendulumNablaSwap: Phase<
  typeof NablaSwapContext,
  PhaseIO<typeof FiatToken.BRL, typeof Networks.Pendulum>,
  PhaseIO<typeof EvmToken.USDC, typeof Networks.Pendulum>
> = {
  context: NablaSwapContext,
  executors: [new NablaApproveExecutor(), new NablaSwapExecutor()],
  name: "PendulumNablaSwap(BRL->USDC)",
  phases: ["nablaApprove", "nablaSwap"],
  async prepareTxs(ctx) {
    const account = requireAccount(ctx.accounts, EphemeralAccountType.Substrate);
    const input = getPendulumDetails(FiatToken.BRL);
    const output = PENDULUM_USDC_ASSETHUB;
    const softMinimumOutputRaw = new Big(ctx.ownMetadata.outputAmountRaw).mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN).toFixed(0, 0);
    const hardMinimumOutputRaw = new Big(ctx.ownMetadata.outputAmountRaw).mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN).toFixed(0, 0);
    const { approve, swap } = await createNablaTransactionsForOnramp(
      ctx.ownMetadata.inputAmountForSwapRaw,
      account,
      input,
      output,
      hardMinimumOutputRaw
    );
    return {
      intents: [
        {
          lane: "main",
          network: Networks.Pendulum,
          phase: "nablaApprove",
          signer: account.address,
          txData: approve.transaction
        },
        {
          lane: "main",
          network: Networks.Pendulum,
          phase: "nablaSwap",
          signer: account.address,
          txData: swap.transaction
        },
        {
          lane: "cleanup",
          network: Networks.Pendulum,
          phase: "pendulumCleanup",
          signer: account.address,
          txData: encodeSubmittableExtrinsic(await preparePendulumCleanupTransaction(input.currencyId, output.currencyId))
        }
      ],
      state: {
        approveExtrinsicOptions: approve.extrinsicOptions,
        softMinimumOutputRaw,
        swapExtrinsicOptions: swap.extrinsicOptions
      }
    };
  },
  async simulate(input, ctx) {
    const inputDetails = getPendulumDetails(FiatToken.BRL);
    const outputDetails = PENDULUM_USDC_ASSETHUB;
    const result = await calculateNablaSwapOutput({
      inputAmountForSwap: input.amount.toString(),
      inputTokenPendulumDetails: inputDetails,
      outputTokenPendulumDetails: outputDetails,
      rampType: ctx.request.rampType
    });
    const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(FiatToken.BRL);
    return {
      metadata: {
        effectiveExchangeRate: result.effectiveExchangeRate,
        inputAmountForSwapDecimal: input.amount.toString(),
        inputAmountForSwapRaw: input.amountRaw,
        inputCurrency: inputDetails.currency,
        inputCurrencyId: inputDetails.currencyId,
        inputDecimals: inputDetails.decimals,
        inputToken: inputDetails.erc20WrapperAddress,
        network: Networks.Pendulum,
        oraclePrice,
        outputAmountDecimal: result.nablaOutputAmountDecimal,
        outputAmountRaw: result.nablaOutputAmountRaw,
        outputCurrency: outputDetails.currency,
        outputCurrencyId: outputDetails.currencyId,
        outputDecimals: outputDetails.decimals,
        outputToken: outputDetails.erc20WrapperAddress
      },
      output: {
        amount: result.nablaOutputAmountDecimal,
        amountRaw: result.nablaOutputAmountRaw,
        chain: Networks.Pendulum,
        token: EvmToken.USDC
      }
    };
  }
};
