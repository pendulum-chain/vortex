import {
  AccountMeta,
  AXL_USDC_MOONBEAM_DETAILS,
  createOnrampSquidrouterTransactionsToEvm,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  EvmTransactionData,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isMoonbeamTokenDetails,
  Networks,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { createMoneriumToAssethubFlow } from "../common/flows";
import { createOnrampEphemeralSelfTransfer, createOnrampUserApprove } from "../common/monerium";
import { createMoonbeamTransactions } from "../common/transactions";
import { validateMoneriumOnramp } from "../common/validation";

export interface MoneriumOnrampTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  destinationAddress: string;
}

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareMoneriumToAssethubOnrampTransactions({
  quote,
  signingAccounts,
  destinationAddress
}: MoneriumOnrampTransactionParams): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  let stateMeta: Partial<StateMetadata> = {};
  const unsignedTxs: UnsignedTx[] = [];

  const { toNetwork, outputTokenDetails, pendulumEphemeralEntry, moonbeamEphemeralEntry, polygonEphemeralEntry } =
    validateMoneriumOnramp(quote, signingAccounts);

  const inputAmountPostAnchorFeeUnits = new Big(quote.inputAmount).minus(quote.fee.anchor);
  const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(inputAmountPostAnchorFeeUnits, ERC20_EURE_POLYGON_DECIMALS).toFixed(
    0,
    0
  );

  const outputAmountBeforeFinalStepRaw = new Big(quote.metadata.onrampOutputAmountMoonbeamRaw).toFixed(0, 0);
  const outputAmountBeforeFinalStepUnits = multiplyByPowerOfTen(
    outputAmountBeforeFinalStepRaw,
    -outputTokenDetails.decimals
  ).toFixed();

  const inputTokenPendulumDetails = getPendulumDetails(EvmToken.USDC);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency, toNetwork);

  stateMeta = {
    destinationAddress,
    inputAmountBeforeSwapRaw: inputAmountPostAnchorFeeRaw,
    inputAmountUnits: inputAmountPostAnchorFeeUnits.toFixed(),
    moonbeamEphemeralAddress: moonbeamEphemeralEntry.address,
    outputAmountBeforeFinalStep: {
      raw: outputAmountBeforeFinalStepRaw,
      units: outputAmountBeforeFinalStepUnits
    },
    outputTokenPendulumDetails,
    outputTokenType: quote.outputCurrency,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
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
        destinationAddress: moonbeamEphemeralEntry.address,
        fromAddress: account.address,
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

      const axlUsdcMoonbeamDetails = getOnChainTokenDetails(Networks.Moonbeam, EvmToken.USDC);
      if (!axlUsdcMoonbeamDetails || !isMoonbeamTokenDetails(axlUsdcMoonbeamDetails)) {
        throw new Error("Could not find Moonbeam details for axlUSDC");
      }

      let moonbeamNonce = 0;
      moonbeamNonce = await createMoonbeamTransactions(
        {
          account,
          inputAmountPostAnchorFeeRaw: quote.metadata.onrampOutputAmountMoonbeamRaw,
          inputTokenDetails: axlUsdcMoonbeamDetails,
          pendulumEphemeralAddress: pendulumEphemeralEntry.address,
          toNetworkId: getNetworkId(toNetwork)
        },
        unsignedTxs,
        moonbeamNonce
      );
    }

    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { nablaStateMeta } = await createMoneriumToAssethubFlow(
        quote,
        pendulumEphemeralEntry,
        outputTokenDetails,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
        destinationAddress,
        unsignedTxs
      );
      stateMeta = { ...stateMeta, ...nablaStateMeta };
    }
  }

  return { stateMeta, unsignedTxs };
}
