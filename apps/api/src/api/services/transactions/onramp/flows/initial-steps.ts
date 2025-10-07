import {
  AccountMeta,
  AXL_USDC_MOONBEAM,
  createOnrampSquidrouterTransactionsFromPolygonToEvm,
  ERC20_EURE_POLYGON,
  EvmTransactionData,
  MoonbeamTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { encodeEvmTransactionData } from "../../index";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";
import { addMoonbeamTransactions } from "../common/transactions";

export async function createMoneriumInitialTransactions(
  quote: QuoteTicketAttributes,
  unsignedTxs: UnsignedTx[],
  destinationAddress: string,
  moonbeamEphemeralEntry: AccountMeta,
  polygonEphemeralEntry: AccountMeta
) {
  if (!quote.metadata.moneriumMint?.amountOutRaw) {
    throw new Error("Missing moneriumMint amountOutRaw in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = quote.metadata.moneriumMint.amountOutRaw;

  const initialTransferTxData = await createOnrampUserApprove(inputAmountPostAnchorFeeRaw, polygonEphemeralEntry.address);

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: 0,
    phase: "moneriumOnrampSelfTransfer",
    signer: destinationAddress,
    txData: encodeEvmTransactionData(initialTransferTxData) as EvmTransactionData
  });

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
    signer: polygonEphemeralEntry.address,
    txData: encodeEvmTransactionData(polygonSelfTransferTxData) as EvmTransactionData
  });

  const { approveData, swapData } = await createOnrampSquidrouterTransactionsFromPolygonToEvm({
    destinationAddress: moonbeamEphemeralEntry.address,
    fromAddress: polygonEphemeralEntry.address,
    fromToken: ERC20_EURE_POLYGON,
    rawAmount: inputAmountPostAnchorFeeRaw,
    toNetwork: Networks.Moonbeam,
    toToken: AXL_USDC_MOONBEAM
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: polygonAccountNonce++,
    phase: "squidRouterApprove",
    signer: polygonEphemeralEntry.address,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: Networks.Polygon,
    nonce: polygonAccountNonce++,
    phase: "squidRouterSwap",
    signer: polygonEphemeralEntry.address,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  return polygonAccountNonce;
}

export async function createBRLAInitialTransactions(
  quote: QuoteTicketAttributes,
  unsignedTxs: UnsignedTx[],
  pendulumEphemeralAddress: string,
  inputTokenDetails: MoonbeamTokenDetails,
  moonbeamEphemeralEntry: AccountMeta,
  toNetworkId: number
) {
  if (!quote.metadata.aveniaMint) {
    throw new Error("Missing aveniaMint in quote metadata");
  }
  const inputAmountPostAnchorFeeRaw = quote.metadata.aveniaMint.amountOutRaw;

  let moonbeamNonce = 0;
  moonbeamNonce = await addMoonbeamTransactions(
    {
      account: moonbeamEphemeralEntry,
      inputAmountPostAnchorFeeRaw,
      inputTokenDetails,
      pendulumEphemeralAddress,
      toNetworkId
    },
    unsignedTxs,
    moonbeamNonce
  );

  return moonbeamNonce;
}
