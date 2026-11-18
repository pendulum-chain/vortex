import {
  EvmClientManager,
  EvmToken,
  getNetworkId,
  Networks,
  QuoteError,
  type RampCurrency,
  type TypedDataDomain
} from "@vortexfi/shared";
import Big from "big.js";
import { parseAbi, zeroAddress } from "viem";
import { APIError } from "../../../../../errors/api-error";
import { estimatePresignedExecutionFeeUsd } from "../../core/evm-destination-gas";
import { overrideFees } from "../../core/fees";
import { defineContext } from "../../core/metadata";
import { isBaseUsdcRobinhoodRoute } from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { resolveAlfredpayPermitDomain } from "../alfredpay-offramp/permit";
import { quoteGasReserve } from "../avenia-stock-mint/simulation";
import { STOCK_SWAP_GAS_LIMIT, UNISWAP_APPROVE_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";
import { type StockSourceToken, stockSourcePin } from "./source";

/** Per transaction: the funding wallet's `permit`, measured at up to 107k live, and the ephemeral's `transferFrom`. */
export const STOCK_PERMIT_GAS_LIMIT = 200_000n;

const permitProbeAbi = parseAbi([
  "function name() view returns (string)",
  "function nonces(address owner) view returns (uint256)"
]);

export interface StockPermitSourceMetadata {
  amountRaw: string;
  gasless: boolean;
  network: typeof Networks.Robinhood | typeof Networks.Base;
  networkFeeUsd: string;
  token: StockSourceToken;
}

export const StockPermitSourceContext = defineContext<StockPermitSourceMetadata>()("stockPermitSource");

export interface StockPermitProbe {
  domain: TypedDataDomain;
  nonce: bigint;
}

// By name, because `@vortexfi/shared` bundles its own viem: what its clients throw fails `instanceof` against this package's copy.
const NO_PERMIT_ERRORS = ["ContractFunctionRevertedError", "ContractFunctionZeroDataError"];

function isNoPermitError(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (NO_PERMIT_ERRORS.includes(cause.name)) return true;
  }
  return false;
}

/**
 * Null means the token answered and has no EIP-2612 permit, so the seller has to send it themselves. A failed read says
 * nothing about the token, and viem wraps both in the same `ContractFunctionExecutionError`, so that one rethrows.
 */
export async function probeStockPermit(symbol: StockSourceToken, owner: `0x${string}`): Promise<StockPermitProbe | null> {
  const { address, network } = stockSourcePin(symbol);
  const client = EvmClientManager.getInstance().getClient(network);
  try {
    const [nonce, name] = await Promise.all([
      client.readContract({ abi: permitProbeAbi, address, args: [owner], functionName: "nonces" }),
      client.readContract({ abi: permitProbeAbi, address, functionName: "name" })
    ]);
    return { domain: await resolveAlfredpayPermitDomain(client, address, getNetworkId(network), name), nonce };
  } catch (error) {
    if (isNoPermitError(error)) return null;
    throw error;
  }
}

export interface StockPermitSimulationDependencies {
  estimateExecutionFeeUsd?: typeof estimatePresignedExecutionFeeUsd;
  probePermit?: typeof probeStockPermit;
}

/** Pass-through. Sets the network fee `DistributeFees` deducts later: everything spent on Robinhood Chain. */
export async function simulateStockPermitSource<
  Token extends StockSourceToken,
  Chain extends typeof Networks.Base | typeof Networks.Robinhood
>(
  token: Token,
  input: PhaseIO<Token, Chain>,
  ctx: PhaseCtx,
  dependencies: StockPermitSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<Token, Chain>, StockPermitSourceMetadata>> {
  const { network } = stockSourcePin(token);
  if (input.chain !== network || input.token !== token) {
    throw new Error(`StockPermitSource requires ${token} on ${Networks.Robinhood}`);
  }
  if (!ctx.fees?.usd) throw new Error("StockPermitSource: Missing fee snapshot");

  const [permit, sourceFeeUsd] = await Promise.all([
    (dependencies.probePermit ?? probeStockPermit)(token, zeroAddress),
    (dependencies.estimateExecutionFeeUsd ?? estimatePresignedExecutionFeeUsd)(
      network,
      network === Networks.Base
        ? 2n * STOCK_PERMIT_GAS_LIMIT + 600_000n
        : 2n * STOCK_PERMIT_GAS_LIMIT + UNISWAP_APPROVE_GAS_LIMIT + STOCK_SWAP_GAS_LIMIT
    )
  ]);
  let networkFeeUsd = sourceFeeUsd;
  let anchorUsd = ctx.fees.usd.anchor;
  if (isBaseUsdcRobinhoodRoute(ctx.request)) {
    if (!permit) throw new APIError({ isPublic: true, message: QuoteError.StockUsdcFundingUnavailable, status: 503 });
    anchorUsd = "0";
    const otherNetwork = network === Networks.Base ? Networks.Robinhood : Networks.Base;
    const otherGas = network === Networks.Base ? UNISWAP_APPROVE_GAS_LIMIT + STOCK_SWAP_GAS_LIMIT : 400_000n;
    const otherFee = await (dependencies.estimateExecutionFeeUsd ?? estimatePresignedExecutionFeeUsd)(otherNetwork, otherGas);
    if (network === Networks.Base) {
      const reserve = await quoteGasReserve(ctx, {});
      ctx.gasReserve = reserve;
      networkFeeUsd = new Big(sourceFeeUsd).plus(otherFee).plus(reserve.usd).toString();
    } else {
      networkFeeUsd = new Big(sourceFeeUsd).plus(otherFee).toString();
    }
  }
  if (
    network === Networks.Base &&
    input.amount.lte(new Big(networkFeeUsd).plus(ctx.fees.usd.vortex).plus(ctx.fees.usd.partnerMarkup))
  ) {
    throw new APIError({ isPublic: true, message: "USDC amount is too low to cover execution fees", status: 400 });
  }
  const usd = EvmToken.USDC as RampCurrency;
  ctx.addNote(
    `StockPermitSource: ${permit ? "permit" : "one transfer"} from the seller, ${networkFeeUsd} USD on Robinhood Chain`
  );
  return {
    // The anchor is a placeholder until AveniaOfframpFee prices it.
    fees: await overrideFees(ctx, {
      anchor: { amount: anchorUsd, currency: usd },
      network: { amount: networkFeeUsd, currency: usd }
    }),
    metadata: { amountRaw: input.amountRaw, gasless: permit !== null, network, networkFeeUsd, token },
    output: input
  };
}
