import {
  AccountMeta,
  createOnrampSquidrouterTransactionsToEvm,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmTransactionData,
  FiatToken,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isAssetHubTokenDetails,
  isOnChainToken,
  isOnChainTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";

export interface MoneriumOnrampTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  destinationAddress: string;
}

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareMoneriumToEvmOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: MoneriumOnrampTransactionParams): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) {
    throw new Error(`Invalid network for destination ${quote.to}`);
  }

  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }

  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const outputTokenDetails = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!outputTokenDetails) {
    throw new Error(`Output token details not found for ${quote.outputCurrency} on network ${toNetwork}`);
  }

  if (!isOnChainTokenDetails(outputTokenDetails)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }
  if (isAssetHubTokenDetails(outputTokenDetails)) {
    throw new Error(`AssetHub token ${quote.outputCurrency} is not supported for onramp.`);
  }

  const polygonEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Moonbeam);
  if (!polygonEphemeralEntry) {
    throw new Error("Polygon ephemeral not found");
  }

  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFeeUnits, ERC20_EURE_POLYGON_DECIMALS).toFixed(
    0,
    0
  );

  stateMeta = {
    destinationAddress,
    inputAmountBeforeSwapRaw: inputAmountPostAnchorFeeRaw,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
    outputTokenType: quote.outputCurrency,
    polygonEphemeralAddress: polygonEphemeralEntry.address,
    walletAddress: destinationAddress
  };

  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, polygonEphemeralEntry.address);

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "moneriumOnrampSelfTransfer",
    signer: destinationAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

  for (const account of signingAccounts) {
    const accountNetworkId = getNetworkId(account.network);

    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      let polygonAccountNonce = 0;

      const polygonSelfTransferTxData = await createOnrampEphemeralSelfTransfer(
        inputAmountPostAnchorFeeRaw,
        destinationAddress,
        polygonEphemeralEntry.address
      );

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "moneriumOnrampSelfTransfer",
        signer: account.address,
        txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
      });

      const { approveData, swapData } = await createOnrampSquidrouterTransactionsToEvm({
        destinationAddress,
        fromAddress: account.address,
        fromNetwork: Networks.Polygon,
        inputTokenDetails: {
          erc20AddressSourceChain: ERC20_EURE_POLYGON
        } as any,
        outputTokenDetails,
        rawAmount: inputAmountPostAnchorFeeRaw,
        toNetwork
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterApprove",
        signer: account.address,
        txData: encodeEvmTransactionData(approveData) as EvmTransactionData
      });

      unsignedTxs.push({
        meta: {},
        network: Networks.Polygon,
        nonce: polygonAccountNonce++,
        phase: "squidRouterSwap",
        signer: account.address,
        txData: encodeEvmTransactionData(swapData) as EvmTransactionData
      });
    }
  }

  return { stateMeta, unsignedTxs };
}
