import { AccountMeta, getNetworkId, getPendulumDetails, Networks, UnsignedTx } from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes, QuoteTicketMetadata } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { createAveniaToAssethubFlow } from "../common/flows";
import { createMoonbeamTransactions } from "../common/transactions";
import { validateAveniaOnramp } from "../common/validation";

/**
 * Main function to prepare all transactions for an on-ramp operation
 * Creates and signs all required transactions so they are ready to be submitted.
 */
export async function prepareAveniaToAssethubOnrampTransactions(
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
    }

    if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { nablaStateMeta } = await createAveniaToAssethubFlow(
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
