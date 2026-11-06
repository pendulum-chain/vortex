import { EvmClientManager, EvmToken, getNetworkId, Networks, type RampCurrency, type TypedDataDomain } from "@vortexfi/shared";
import { parseAbi, zeroAddress } from "viem";
import { estimatePresignedExecutionFeeUsd } from "../../core/evm-destination-gas";
import { overrideFees } from "../../core/fees";
import { defineContext } from "../../core/metadata";
import { ROBINHOOD_STOCKS, type StockSymbol } from "../../core/robinhood-stocks";
import type { PhaseCtx, PhaseIO, PhaseResult } from "../../core/types";
import { resolveAlfredpayPermitDomain } from "../alfredpay-offramp/permit";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../uniswap-v3-fixed-swap/contract";

/** Per transaction: the funding wallet's `permit`, measured at up to 107k live, and the ephemeral's `transferFrom`. */
export const STOCK_PERMIT_GAS_LIMIT = 200_000n;

const permitProbeAbi = parseAbi([
  "function name() view returns (string)",
  "function nonces(address owner) view returns (uint256)"
]);

export interface StockPermitSourceMetadata {
  amountRaw: string;
  gasless: boolean;
  network: typeof Networks.Robinhood;
  networkFeeUsd: string;
  token: StockSymbol;
}

export const StockPermitSourceContext = defineContext<StockPermitSourceMetadata>()("stockPermitSource");

export interface StockPermitProbe {
  domain: TypedDataDomain;
  nonce: bigint;
}

/** Null means the token has no EIP-2612 permit, so the seller has to send it themselves. */
export async function probeStockPermit(symbol: StockSymbol, owner: `0x${string}`): Promise<StockPermitProbe | null> {
  const address = ROBINHOOD_STOCKS[symbol].address;
  const client = EvmClientManager.getInstance().getClient(Networks.Robinhood);
  try {
    const [nonce, name] = await Promise.all([
      client.readContract({ abi: permitProbeAbi, address, args: [owner], functionName: "nonces" }),
      client.readContract({ abi: permitProbeAbi, address, functionName: "name" })
    ]);
    return { domain: await resolveAlfredpayPermitDomain(client, address, getNetworkId(Networks.Robinhood), name), nonce };
  } catch (error) {
    if (error instanceof Error && error.name === "ContractFunctionExecutionError") return null;
    throw error;
  }
}

export interface StockPermitSimulationDependencies {
  estimateExecutionFeeUsd?: typeof estimatePresignedExecutionFeeUsd;
  probePermit?: typeof probeStockPermit;
}

/** Pass-through. Sets the network fee `DistributeFees` deducts later: everything spent on Robinhood Chain. */
export async function simulateStockPermitSource<Token extends StockSymbol>(
  token: Token,
  input: PhaseIO<Token, typeof Networks.Robinhood>,
  ctx: PhaseCtx,
  dependencies: StockPermitSimulationDependencies = {}
): Promise<PhaseResult<PhaseIO<Token, typeof Networks.Robinhood>, StockPermitSourceMetadata>> {
  if (input.chain !== Networks.Robinhood || input.token !== token) {
    throw new Error(`StockPermitSource requires ${token} on ${Networks.Robinhood}`);
  }
  if (!ctx.fees?.usd) throw new Error("StockPermitSource: Missing fee snapshot");

  const [permit, networkFeeUsd] = await Promise.all([
    (dependencies.probePermit ?? probeStockPermit)(token, zeroAddress),
    (dependencies.estimateExecutionFeeUsd ?? estimatePresignedExecutionFeeUsd)(
      Networks.Robinhood,
      2n * STOCK_PERMIT_GAS_LIMIT + UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT
    )
  ]);
  const usd = EvmToken.USDC as RampCurrency;
  ctx.addNote(
    `StockPermitSource: ${permit ? "permit" : "one transfer"} from the seller, ${networkFeeUsd} USD on Robinhood Chain`
  );
  return {
    // The anchor is a placeholder until AveniaOfframpFee prices it.
    fees: await overrideFees(ctx, {
      anchor: { amount: ctx.fees.usd.anchor, currency: usd },
      network: { amount: networkFeeUsd, currency: usd }
    }),
    metadata: { amountRaw: input.amountRaw, gasless: permit !== null, network: Networks.Robinhood, networkFeeUsd, token },
    output: input
  };
}
