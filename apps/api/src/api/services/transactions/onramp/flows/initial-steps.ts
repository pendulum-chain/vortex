import {
  AccountMeta,
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsToEvm,
  ERC20_EURE_POLYGON,
  EvmTransactionData,
  getOnChainTokenDetails,
  isMoonbeamTokenDetails,
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
  polygonEphemeralEntry: AccountMeta,
  inputAmountPostAnchorFeeRaw: string
) {
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

  const { approveData, swapData } = await createOnrampSquidrouterTransactionsToEvm({
    destinationAddress: moonbeamEphemeralEntry.address,
    fromAddress: polygonEphemeralEntry.address,
    fromNetwork: Networks.Polygon,
    inputTokenDetails: {
      erc20AddressSourceChain: ERC20_EURE_POLYGON
    } as any,
    outputTokenDetails: AXL_USDC_MOONBEAM_DETAILS,
    rawAmount: inputAmountPostAnchorFeeRaw,
    toNetwork: Networks.Moonbeam
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
  unsignedTxs: UnsignedTx[],
  pendulumEphemeralAddress: string,
  inputAmountPostAnchorFeeRaw: string,
  inputTokenDetails: MoonbeamTokenDetails,
  moonbeamEphemeralEntry: AccountMeta,
  toNetworkId: number
) {
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
