import {
  checkEvmBalanceForToken,
  EvmClientManager,
  EvmNetworks,
  EvmToken,
  EvmTokenDetails,
  getOnChainTokenDetails,
  Networks,
  nativeToDecimal,
  RampCurrency,
  RampDirection,
  RampPhase
} from "@vortexfi/shared";
import { Big } from "big.js";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import RampState from "../../../../../models/rampState.model";
import { SubsidyToken } from "../../../../../models/subsidy.model";
import { PhaseError } from "../../../../errors/phase-error";
import { BasePhaseHandler } from "../../../phases/base-phase-handler";
import { getEvmFundingAccount } from "../../../phases/evm-funding";
import { StateMetadata } from "../../../phases/meta-state-types";
import { priceFeedService } from "../../../priceFeed.service";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO, TokenBrand } from "../core/types";

export interface SubsidyMeta {
  applied: boolean;
  subsidyRate: Big;
  partnerId: string | null;
  expectedOutputAmountDecimal: Big;
  expectedOutputAmountRaw: string;
  actualOutputAmountDecimal: Big;
  actualOutputAmountRaw: string;
  subsidyAmountInOutputTokenDecimal: Big;
  subsidyAmountInOutputTokenRaw: string;
  idealSubsidyAmountInOutputTokenDecimal: Big;
  idealSubsidyAmountInOutputTokenRaw: string;
  targetOutputAmountDecimal: Big;
  targetOutputAmountRaw: string;
  adjustedDifference: Big;
  adjustedTargetDiscount: Big;
}

export function buildFullSubsidy(
  actualOutputAmountDecimal: Big,
  actualOutputAmountRaw: string,
  expectedOutputAmountDecimal: Big,
  expectedOutputAmountRaw: string,
  ctx: PhaseCtx
): SubsidyMeta {
  const partner = ctx.partner;
  const targetDiscount = partner?.targetDiscount ?? 0;
  const maxSubsidy = partner?.maxSubsidy ?? 0;

  const idealSubsidyAmountInOutputTokenDecimal = actualOutputAmountDecimal.gte(expectedOutputAmountDecimal)
    ? new Big(0)
    : expectedOutputAmountDecimal.minus(actualOutputAmountDecimal);

  const subsidyAmountInOutputTokenDecimal =
    targetDiscount !== 0
      ? capSubsidy(idealSubsidyAmountInOutputTokenDecimal, expectedOutputAmountDecimal, maxSubsidy)
      : new Big(0);

  const targetOutputAmountDecimal = actualOutputAmountDecimal.plus(subsidyAmountInOutputTokenDecimal);
  const subsidyRate = expectedOutputAmountDecimal.gt(0)
    ? subsidyAmountInOutputTokenDecimal.div(expectedOutputAmountDecimal)
    : new Big(0);

  const toRaw = (decimal: Big): string =>
    actualOutputAmountDecimal.gt(0)
      ? new Big(actualOutputAmountRaw).times(decimal).div(actualOutputAmountDecimal).toFixed(0, 0)
      : "0";

  return {
    actualOutputAmountDecimal,
    actualOutputAmountRaw,
    adjustedDifference: new Big(0),
    adjustedTargetDiscount: new Big(0),
    applied: subsidyAmountInOutputTokenDecimal.gt(0),
    expectedOutputAmountDecimal,
    expectedOutputAmountRaw,
    idealSubsidyAmountInOutputTokenDecimal,
    idealSubsidyAmountInOutputTokenRaw: toRaw(idealSubsidyAmountInOutputTokenDecimal),
    partnerId: partner?.id ?? null,
    subsidyAmountInOutputTokenDecimal,
    subsidyAmountInOutputTokenRaw: toRaw(subsidyAmountInOutputTokenDecimal),
    subsidyRate,
    targetOutputAmountDecimal,
    targetOutputAmountRaw: toRaw(targetOutputAmountDecimal)
  };
}

function capSubsidy(idealSubsidy: Big, expectedOutput: Big, maxSubsidy: number): Big {
  if (maxSubsidy > 0) {
    const maxAllowed = expectedOutput.mul(maxSubsidy);
    return idealSubsidy.gt(maxAllowed) ? maxAllowed : idealSubsidy;
  }
  return idealSubsidy;
}

export async function computeExpectedOutput(ctx: PhaseCtx): Promise<{ decimal: Big; raw: string }> {
  let expectedOutputAmount = new Big(ctx.request.inputAmount);
  try {
    const oraclePrice = await priceFeedService.getFiatToUsdExchangeRate(ctx.request.inputCurrency);
    const isOfframp = ctx.request.rampType === RampDirection.SELL;
    const effectivePrice = isOfframp ? new Big(1).div(oraclePrice) : oraclePrice;
    const targetDiscount = ctx.partner?.targetDiscount ?? 0;
    const discountedRate = effectivePrice.mul(new Big(1).plus(targetDiscount));
    expectedOutputAmount = new Big(ctx.request.inputAmount).mul(discountedRate);
  } catch (error) {
    ctx.addNote(`computeExpectedOutput: oracle price unavailable, using input amount. Error: ${error}`);
  }
  const expectedOutputAmountRaw = expectedOutputAmount.times(new Big(10).pow(6)).toFixed(0, 0);
  return { decimal: expectedOutputAmount, raw: expectedOutputAmountRaw };
}

// EVM slice of the production SubsidizePreSwapPhaseHandler: tops up the ephemeral's Nabla input
// token on Base until it matches the simulated swap input. Substrate and Alfredpay branches are
// not ported.
class SubsidizePreSwapExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "subsidizePreSwap";
  }

  public getMaxRetries(): number {
    return 200;
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    const { evmEphemeralAddress } = state.state as StateMetadata;
    if (!evmEphemeralAddress) {
      throw new Error("SubsidizePreSwapExecutor: State metadata corrupted. This is a bug.");
    }

    if (!quote.metadata.nablaSwapEvm) {
      throw new Error("Missing nablaSwapEvm information in quote metadata");
    }

    try {
      const inputToken = quote.metadata.nablaSwapEvm.inputCurrency as EvmToken;
      const inputTokenDetails = getOnChainTokenDetails(Networks.Base, inputToken) as EvmTokenDetails;
      if (!inputTokenDetails) {
        throw new Error(
          `Could not find token details for input token ${inputToken} on network ${Networks.Base}. Invalid quote metadata.`
        );
      }
      const expectedInputAmountForSwapRaw = quote.metadata.nablaSwapEvm.inputAmountForSwapRaw;

      // Wait for token settlement before checking balance
      await new Promise(resolve => setTimeout(resolve, 15000));

      const currentBalance = await checkEvmBalanceForToken({
        amountDesiredRaw: "1",
        chain: inputTokenDetails.network as EvmNetworks,
        intervalMs: 1000,
        ownerAddress: evmEphemeralAddress,
        timeoutMs: 5000,
        tokenDetails: inputTokenDetails
      });

      if (currentBalance.eq(Big(0))) {
        throw new Error("Invalid phase: input token did not arrive yet on EVM");
      }

      const requiredAmount = Big(expectedInputAmountForSwapRaw).sub(currentBalance);
      logger.debug(`SubsidizePreSwapExecutor: requiredAmount ${requiredAmount.toString()}`);

      if (requiredAmount.gt(Big(0))) {
        const subsidyDecimal = nativeToDecimal(requiredAmount, quote.metadata.nablaSwapEvm.inputDecimals).toString();
        const subsidyUsd = await priceFeedService.convertCurrency(
          subsidyDecimal,
          inputToken as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const quoteOutputUsd = await priceFeedService.convertCurrency(
          quote.outputAmount,
          quote.outputCurrency as RampCurrency,
          EvmToken.USDC as RampCurrency
        );
        const subsidyCapFraction = config.subsidy.evmSwapSubsidyQuoteFraction;
        const percentageCap = Big(quoteOutputUsd).mul(subsidyCapFraction);
        const subsidyCapUsd = percentageCap.gt("1") ? percentageCap : Big("1");
        if (Big(subsidyUsd).gt(subsidyCapUsd)) {
          // Pause for operator intervention without moving the ramp to failed.
          throw this.createRecoverableError(
            `SubsidizePreSwapExecutor: Required subsidy $${subsidyUsd} exceeds cap $${subsidyCapUsd.toFixed(2)} (max of $1.00 and ${subsidyCapFraction} of quote output $${quoteOutputUsd}).`
          );
        }

        logger.info(
          `Subsidizing pre-swap EVM with ${requiredAmount.toFixed()} to reach target value of ${expectedInputAmountForSwapRaw}`
        );

        const evmClientManager = EvmClientManager.getInstance();
        const destinationNetwork = inputTokenDetails.network as EvmNetworks;
        const fundingAccount = getEvmFundingAccount(destinationNetwork);

        const publicClient = evmClientManager.getClient(destinationNetwork);
        const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();

        const data = encodeFunctionData({
          abi: erc20Abi,
          args: [evmEphemeralAddress as `0x${string}`, BigInt(requiredAmount.toFixed(0))],
          functionName: "transfer"
        });

        const txHash = await evmClientManager.sendTransactionWithBlindRetry(destinationNetwork, fundingAccount, {
          data,
          maxFeePerGas,
          maxPriorityFeePerGas,
          to: inputTokenDetails.erc20AddressSourceChain as `0x${string}`,
          value: 0n
        });

        const subsidyAmount = nativeToDecimal(requiredAmount, quote.metadata.nablaSwapEvm.inputDecimals).toNumber();
        const subsidyToken = quote.metadata.nablaSwapEvm.inputCurrency as unknown as SubsidyToken;

        await this.createSubsidy(state, subsidyAmount, subsidyToken, fundingAccount.address, txHash);

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as `0x${string}`
        });

        if (!receipt || receipt.status !== "success") {
          throw new Error(`SubsidizePreSwapExecutor: Subsidy transaction ${txHash} failed or was not found`);
        }
      }

      return state;
    } catch (e) {
      logger.error("Error in subsidizePreSwap (EVM):", e);
      if (e instanceof PhaseError) {
        throw e;
      }
      throw this.createRecoverableError("SubsidizePreSwapExecutor: Failed to subsidize pre swap on EVM.");
    }
  }
}

export function SubsidizePre<Token extends TokenBrand, Chain extends ChainBrand>(): Phase<
  PhaseIO<Token, Chain>,
  PhaseIO<Token, Chain>
> {
  return {
    executors: [new SubsidizePreSwapExecutor()],
    name: "SubsidizePre",
    phases: ["subsidizePreSwap"],
    async simulate(input: PhaseIO<Token, Chain>, ctx: PhaseCtx): Promise<PhaseIO<Token, Chain>> {
      const expected = await computeExpectedOutput(ctx);
      ctx.addNote(`SubsidizePre: expected output ${expected.decimal.toFixed()} ${input.token}`);
      return {
        ...input,
        meta: {
          ...input.meta,
          subsidy: {
            expectedOutputAmountDecimal: expected.decimal,
            expectedOutputAmountRaw: expected.raw
          }
        }
      };
    }
  };
}
