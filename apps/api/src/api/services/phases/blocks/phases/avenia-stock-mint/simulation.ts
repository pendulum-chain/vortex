import { EvmClientManager, EvmToken, FiatToken, Networks, type RampCurrency } from "@vortexfi/shared";
import Big from "big.js";
import { formatEther } from "viem";
import { config } from "../../../../../../config/vars";
import { priceFeedService } from "../../../../priceFeed.service";
import { estimatePresignedExecutionFeeUsd } from "../../core/evm-destination-gas";
import { overrideFees } from "../../core/fees";
import type { GasReserveQuote } from "../../core/metadata";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { AveniaMintContext, type AveniaMintMetadata, simulateAveniaMint } from "../avenia-mint/simulation";
import { STOCK_SWAP_GAS_LIMIT, UNISWAP_APPROVE_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";

const USD = EvmToken.USDC as RampCurrency;

export interface AveniaStockMintDependencies {
  estimateExecutionFeeUsd?: typeof estimatePresignedExecutionFeeUsd;
  getNativeBalance?: (address: `0x${string}`) => Promise<bigint>;
}

async function quoteGasReserve(ctx: PhaseCtx, dependencies: AveniaStockMintDependencies): Promise<GasReserveQuote> {
  const { gasReserveTargetWei: target, gasReserveThresholdWei: threshold } = config.stocks;
  if (target === 0n) return { amountRaw: "0", currency: "ETH", fiat: "0", usd: "0" };

  const quotedFor = ctx.request.destinationAddress;
  let amount = target;
  if (quotedFor) {
    const getNativeBalance =
      dependencies.getNativeBalance ??
      (address => EvmClientManager.getInstance().getClient(Networks.Robinhood).getBalance({ address }));
    const balance = await getNativeBalance(quotedFor as `0x${string}`);
    amount = balance >= threshold ? 0n : target - balance;
  }
  const displayCurrency = ctx.fees?.displayFiat?.currency;
  if (!displayCurrency) throw new Error("AveniaStockMint: Missing fee snapshot");
  const usd = amount === 0n ? "0" : await priceFeedService.convertCurrency(formatEther(amount), "ETH" as RampCurrency, USD);
  const fiat = amount === 0n ? "0" : await priceFeedService.convertCurrency(usd, USD, displayCurrency);
  return { amountRaw: amount.toString(), currency: "ETH", fiat, ...(quotedFor ? { quotedFor } : {}), usd };
}

/** Sets the network fee `DistributeFees` deducts later: the swap on Robinhood Chain and the gas reserve. No Squid probe. */
export async function simulateAveniaStockMint(
  input: PhaseIO<typeof FiatToken.BRL, "fiat">,
  ctx: PhaseCtx,
  dependencies: AveniaStockMintDependencies = {}
): Promise<PhaseResult<PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>, AveniaMintMetadata>> {
  const result = await simulateAveniaMint(input, ctx);
  const [swapFeeUsd, gasReserve] = await Promise.all([
    (dependencies.estimateExecutionFeeUsd ?? estimatePresignedExecutionFeeUsd)(
      Networks.Robinhood,
      UNISWAP_APPROVE_GAS_LIMIT + STOCK_SWAP_GAS_LIMIT
    ),
    quoteGasReserve(ctx, dependencies)
  ]);
  ctx.gasReserve = gasReserve;
  ctx.addNote(`AveniaStockMint: swap execution ${swapFeeUsd} USD, gas reserve ${gasReserve.amountRaw} wei`);
  return {
    ...result,
    fees: await overrideFees(ctx, {
      anchor: {
        amount: new Big(result.metadata.mint.fee).plus(result.metadata.transfer.fee).toString(),
        currency: FiatToken.BRL as RampCurrency
      },
      network: { amount: new Big(swapFeeUsd).plus(gasReserve.usd).toString(), currency: USD }
    })
  };
}

export { AveniaMintContext };
