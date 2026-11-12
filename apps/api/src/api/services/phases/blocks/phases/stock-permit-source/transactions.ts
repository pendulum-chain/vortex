import {
  EphemeralAccountType,
  EvmClientManager,
  type EvmTransactionData,
  Networks,
  PRESIGNED_EVM_FEE_MULTIPLIER,
  RELAY_BASE_USDC_ADDRESS,
  type SignedTypedData
} from "@vortexfi/shared";
import httpStatus from "http-status";
import { encodeFunctionData, erc20Abi } from "viem";
import logger from "../../../../../../config/logger";
import { APIError } from "../../../../../errors/api-error";
import { requireAccount } from "../../core/accounts";
import { getEvmFundingAccount } from "../../core/evm-funding";
import { encodeEvmTransactionData, prepareBaseCleanupApproval } from "../../core/evm-transactions";
import { isBaseUsdcRobinhoodRoute } from "../../core/robinhood-stocks";
import type { PrepareCtx, PreparedPhaseTxs, TxIntent } from "../../core/types";
import { moneriumPermitTypes, moneriumTransferFromAbi } from "../monerium-self-transfer/contract";
import type { StockPermitSourceRegistrationFacts } from "./registration";
import { probeStockPermit, STOCK_PERMIT_GAS_LIMIT, type StockPermitProbe, type StockPermitSourceMetadata } from "./simulation";
import { stockSourcePin } from "./source";

const PERMIT_LIFETIME_SECONDS = 60 * 60;
const USER_TRANSFER_GAS_LIMIT = 85_000n;

export interface StockPermitSourceState extends StockPermitSourceRegistrationFacts {
  amountRaw: string;
  isNoPermitFallback?: true;
  token: StockPermitSourceMetadata["token"];
}

export interface StockPermitTransactionDependencies {
  now?: () => number;
  probeFees?: () => Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  probePermit?: typeof probeStockPermit;
}

function permitIntents(
  permit: StockPermitProbe,
  owner: string,
  ephemeral: string,
  tokenAddress: `0x${string}`,
  amountRaw: string,
  fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  nowMs: number,
  network: typeof Networks.Base | typeof Networks.Robinhood
): TxIntent[] {
  const typedData: SignedTypedData = {
    domain: permit.domain,
    message: {
      deadline: (Math.floor(nowMs / 1000) + PERMIT_LIFETIME_SECONDS).toString(),
      nonce: permit.nonce.toString(),
      owner,
      spender: ephemeral,
      value: amountRaw
    },
    primaryType: "Permit",
    types: moneriumPermitTypes
  };
  return [
    { lane: "main", network, phase: "stockPermitTransfer", signer: owner, txData: typedData },
    {
      lane: "main",
      network,
      phase: "stockPermitTransfer",
      prefundNativeValueRaw: (STOCK_PERMIT_GAS_LIMIT * fees.maxFeePerGas * PRESIGNED_EVM_FEE_MULTIPLIER).toString(),
      signer: ephemeral,
      txData: {
        data: encodeFunctionData({
          abi: moneriumTransferFromAbi,
          args: [owner as `0x${string}`, ephemeral as `0x${string}`, BigInt(amountRaw)],
          functionName: "transferFrom"
        }),
        gas: STOCK_PERMIT_GAS_LIMIT.toString(),
        maxFeePerGas: fees.maxFeePerGas.toString(),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
        to: tokenAddress,
        value: "0"
      }
    }
  ];
}

/** Broadcast by the seller's wallet, so this phase is already barred from presigned submissions and covered by funded-sell recovery. */
function userTransferIntent(
  owner: string,
  ephemeral: string,
  tokenAddress: `0x${string}`,
  amountRaw: string,
  fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  network: typeof Networks.Base | typeof Networks.Robinhood
): TxIntent {
  return {
    lane: "main",
    network,
    phase: "squidRouterNoPermitTransfer",
    signer: owner,
    txData: {
      data: encodeFunctionData({
        abi: erc20Abi,
        args: [ephemeral as `0x${string}`, BigInt(amountRaw)],
        functionName: "transfer"
      }),
      gas: USER_TRANSFER_GAS_LIMIT.toString(),
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      to: tokenAddress,
      value: "0"
    }
  };
}

export async function prepareStockPermitSourceTxs(
  ctx: PrepareCtx<StockPermitSourceMetadata, StockPermitSourceRegistrationFacts>,
  dependencies: StockPermitTransactionDependencies = {}
): Promise<PreparedPhaseTxs> {
  const facts = ctx.ownRegistrationFacts;
  if (!facts) throw new Error("StockPermitSource registration facts are required");
  const ephemeral = requireAccount(ctx.accounts, EphemeralAccountType.EVM).address;
  const { amountRaw, token } = ctx.ownMetadata;
  const { address: tokenAddress, network } = stockSourcePin(token);
  const probe = (dependencies.probePermit ?? probeStockPermit)(token, facts.owner as `0x${string}`);
  const [permit, fees] = await Promise.all([
    // A gasless quote is bound to the permit path, so a permit that cannot be read gets the same answer as a missing one.
    ctx.ownMetadata.gasless
      ? probe.catch(error => {
          logger.warn(
            `StockPermitSource: permit read failed at registration: ${error instanceof Error ? error.message : error}`
          );
          return null;
        })
      : probe,
    dependencies.probeFees ? dependencies.probeFees() : EvmClientManager.getInstance().getClient(network).estimateFeesPerGas()
  ]);
  const state: StockPermitSourceState = { amountRaw, owner: facts.owner, token };
  // The USDC corridor's Base ephemeral holds the user's USDC before the bridge (BUY) and after it (SELL), but no
  // later phase of that flow signs a Base cleanup. This approval lets an operator refund it and post-processing sweep it.
  const cleanup: TxIntent[] = isBaseUsdcRobinhoodRoute(ctx.quote)
    ? [
        {
          lane: "cleanup",
          network: Networks.Base,
          phase: "baseCleanupUsdc",
          signer: ephemeral,
          txData: encodeEvmTransactionData(
            await prepareBaseCleanupApproval(
              RELAY_BASE_USDC_ADDRESS as `0x${string}`,
              getEvmFundingAccount(Networks.Base).address,
              Networks.Base
            )
          ) as EvmTransactionData
        }
      ]
    : [];
  if (!permit) {
    // The quote promised a sale that needs no ETH. A wallet-paid transfer now could leave the seller unable to send it.
    if (ctx.ownMetadata.gasless) {
      throw new APIError({
        isPublic: true,
        message: "Selling this token is temporarily unavailable. Please try again later.",
        status: httpStatus.SERVICE_UNAVAILABLE
      });
    }
    return {
      intents: [userTransferIntent(facts.owner, ephemeral, tokenAddress, amountRaw, fees, network), ...cleanup],
      state: { ...state, isNoPermitFallback: true }
    };
  }
  return {
    intents: [
      ...permitIntents(
        permit,
        facts.owner,
        ephemeral,
        tokenAddress,
        amountRaw,
        fees,
        dependencies.now?.() ?? Date.now(),
        network
      ),
      ...cleanup
    ],
    state
  };
}
