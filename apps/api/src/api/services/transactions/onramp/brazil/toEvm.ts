import {
  AccountMeta,
  createOnrampSquidrouterTransactions,
  EvmTransactionData,
  getNetworkId,
  getPendulumDetails,
  isEvmTokenDetails,
  Networks,
  OnChainTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes, QuoteTicketMetadata } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createAveniaToEvmFlow } from "../common/flows";
import { createMoonbeamTransactions } from "../common/transactions";
import { validateAveniaOnramp } from "../common/validation";

/**
 * Creates the Squidrouter transactions from axlUSDC on Moonbeam to the final destination EVM chain.
 *
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
async function createSquidRouterTransactions(
  params: {
    destinationAddress: string;
    account: AccountMeta;
    rawAmount: string;
    toNetwork: Networks;
    outputTokenDetails: OnChainTokenDetails;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const { destinationAddress, account, rawAmount, toNetwork, outputTokenDetails } = params;

  if (!isEvmTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be an EVM token for onramp to any EVM chain, got ${outputTokenDetails.assetSymbol}`);
  }

  const { approveData, swapData } = await createOnrampSquidrouterTransactions({
    destinationAddress,
    fromAddress: account.address,
    moonbeamEphemeralStartingNonce: nextNonce,
    outputTokenDetails,
    rawAmount: rawAmount,
    toNetwork
  });

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "squidRouterApprove",
    signer: account.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });
  nextNonce++;

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
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareAveniaToEvmOnrampTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  destinationAddress: string,
  taxId: string
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, inputTokenDetails } =
    validateAveniaOnramp(quote, signingAccounts);
  const toNetworkId = getNetworkId(toNetwork);

  const metadata = quote.metadata as QuoteTicketMetadata;

  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFeeUnits, inputTokenDetails.decimals).toFixed(
    0,
    0
  );

  const outputAmountBeforeFinalStepRaw = new Big(metadata.onrampOutputAmountMoonbeamRaw).toFixed(0, 0);
  const outputAmountBeforeFinalStepUnits = multiplyByPowerOfTen(
    outputAmountBeforeFinalStepRaw,
    -outputTokenDetails.decimals
  ).toFixed();

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  stateMeta = {
    destinationAddress,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
    inputTokenPendulumDetails,
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    outputAmountBeforeFinalStep: {
      raw: outputAmountBeforeFinalStepRaw,
      units: outputAmountBeforeFinalStepUnits
    },
    outputTokenPendulumDetails,
    outputTokenType: quote.outputCurrency,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
    taxId
  };

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      let moonbeamNonce = 0;
      moonbeamNonce = await createMoonbeamTransactions(
        {
          account,
          inputAmountPostAnchorFeeRaw,
          inputTokenDetails,
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          toNetworkId
        },
        unsignedTxs,
        moonbeamNonce
      );

      moonbeamNonce = await createSquidRouterTransactions(
        {
          account,
          destinationAddress,
          outputTokenDetails,
          rawAmount: metadata.onrampOutputAmountMoonbeamRaw,
          toNetwork
        },
        unsignedTxs,
        moonbeamNonce
      );
    }

    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { nablaStateMeta } = await createAveniaToEvmFlow(
        quote,
        pendulumEphemeralEntry,
        moonbeamEphemeralEntry.address,
        outputTokenDetails,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        unsignedTxs
      );
      stateMeta = { ...stateMeta, ...nablaStateMeta };
    }
  }

  return { stateMeta, unsignedTxs };
}
