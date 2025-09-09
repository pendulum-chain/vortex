import {
  AccountMeta,
  createMoonbeamToAssethubTransfer,
  createOnrampSquidrouterTransactions,
  EvmTokenDetails,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  getAnyFiatTokenDetailsMoonbeam,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isMoonbeamTokenDetails,
  isOnChainToken,
  MoonbeamTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { StateMetadata } from "../phases/meta-state-types";
import { encodeEvmTransactionData } from "./index";

/**
 * Creates Squidrouter transactions.
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createSquidrouterTransactions(
  params: {
    outputTokenDetails: EvmTokenDetails;
    toNetwork: Networks;
    rawAmount: string;
    destinationAddress: string;
    account: AccountMeta;
    moonbeamEphemeralAddress: string;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const { outputTokenDetails, toNetwork, rawAmount, destinationAddress, account, moonbeamEphemeralAddress } = params;

  const { approveData, swapData } = await createOnrampSquidrouterTransactions({
    addressDestination: destinationAddress,
    fromAddress: account.address,
    moonbeamEphemeralAddress,
    moonbeamEphemeralStartingNonce: nextNonce,
    outputTokenDetails,
    rawAmount,
    toNetwork
  });

  if (approveData) {
    unsignedTxs.push({
      meta: {},
      network: account.network,
      nonce: nextNonce,
      phase: "squidRouterApprove",
      signer: account.address,
      txData: encodeEvmTransactionData(approveData) as EvmTransactionData
    });
    nextNonce++;
  }

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "squidRouterSwap",
    signer: account.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });
  nextNonce++;

  return nextNonce;
}

/**
 * Prepares a list of unsigned transactions for the onramp process.
 * This function orchestrates the creation of transactions for the simplified onramp flow.
 *
 * @param quote - The quote ticket containing all necessary information for the transaction.
 * @param account - The user's account information (must be the Moonbeam account).
 * @param destinationAddress - The final destination address for the funds.
 * @param moonbeamEphemeralAddress - The ephemeral address on Moonbeam, used by Squid.
 * @returns A promise that resolves to an object containing the list of unsigned transactions and state metadata.
 */
export async function prepareOnrampTransactions(
  quote: QuoteTicketAttributes,
  account: AccountMeta,
  destinationAddress: string,
  moonbeamEphemeralAddress: string
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata> }> {
  const unsignedTxs: UnsignedTx[] = [];
  const stateMeta: Partial<StateMetadata> = {};
  let nextNonce = 0;

  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be a fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetailsMoonbeam(quote.inputCurrency);

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);

  if (!outputTokenDetails) {
    throw new Error(`Could not get token details for ${quote.outputCurrency} on ${toNetwork}`);
  }

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error("Output token must be an EVM token for this flow.");
  }

  const inputAmountPostAnchorFee = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFee, inputTokenDetails.decimals).toFixed(0, 0);

  nextNonce = await createSquidrouterTransactions(
    {
      account,
      destinationAddress,
      moonbeamEphemeralAddress,
      outputTokenDetails,
      rawAmount: inputAmountPostAnchorFeeRaw,
      toNetwork
    },
    unsignedTxs,
    nextNonce
  );

  if (toNetwork === Networks.AssetHub) {
    if (!isMoonbeamTokenDetails(outputTokenDetails)) {
      throw new Error("Output token for AssetHub destination must be a Moonbeam token (e.g., axlUSDC).");
    }

    const finalOutputAmountRaw = multiplyByPowerOfTen(
      new Big(quote.outputAmount),
      (outputTokenDetails as MoonbeamTokenDetails).decimals
    ).toFixed(0, 0);

    const moonbeamToAssethubTx = await createMoonbeamToAssethubTransfer(
      destinationAddress,
      finalOutputAmountRaw,
      (outputTokenDetails as MoonbeamTokenDetails).moonbeamErc20Address
    );

    unsignedTxs.push({
      meta: {},
      network: account.network,
      nonce: nextNonce,
      phase: "moonbeamXcmToAssethub",
      signer: account.address,
      txData: encodeSubmittableExtrinsic(moonbeamToAssethubTx)
    });
    nextNonce++;
  }

  return { stateMeta, unsignedTxs };
}
