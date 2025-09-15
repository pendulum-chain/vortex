import {
  AccountMeta,
  createPendulumToAssethubTransfer,
  createPendulumToMoonbeamTransfer,
  encodeSubmittableExtrinsic,
  getNetworkId,
  Networks,
  OnChainTokenDetails,
  PendulumTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";
import { addFeeDistributionTransaction, createNablaSwapTransactions } from "./transactions";

/**
 * Creates Pendulum cleanup transaction
 * @param params Transaction parameters
 * @returns Cleanup transaction template
 */
async function createPendulumCleanupTx(params: {
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
  account: AccountMeta;
}): Promise<Omit<UnsignedTx, "nonce">> {
  const { inputTokenPendulumDetails, outputTokenPendulumDetails, account } = params;

  const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
    inputTokenPendulumDetails.currencyId,
    outputTokenPendulumDetails.currencyId
  );

  return {
    meta: {},
    network: account.network,
    phase: "pendulumCleanup",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
  };
}

export async function createAveniaToAssethubFlow(
  quote: QuoteTicketAttributes,
  pendulumEphemeralEntry: AccountMeta,
  outputTokenDetails: OnChainTokenDetails,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  destinationAddress: string,
  unsignedTxs: UnsignedTx[]
) {
  let pendulumNonce = 0;
  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await createNablaSwapTransactions(
    {
      account: pendulumEphemeralEntry,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      quote
    },
    unsignedTxs,
    pendulumNonce
  );
  pendulumNonce = nonceAfterNabla;

  pendulumNonce = await addFeeDistributionTransaction(quote, pendulumEphemeralEntry, unsignedTxs, pendulumNonce);

  const pendulumCleanupTx = await createPendulumCleanupTx({
    account: pendulumEphemeralEntry,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails
  });

  const finalOutputAmountRaw = multiplyByPowerOfTen(
    new Big(quote.outputAmount),
    outputTokenDetails.pendulumRepresentative.decimals
  ).toFixed(0, 0);

  const pendulumToAssethubXcmTransaction = await createPendulumToAssethubTransfer(
    destinationAddress,
    outputTokenDetails.pendulumRepresentative.currencyId,
    finalOutputAmountRaw
  );

  unsignedTxs.push({
    meta: {},
    network: pendulumEphemeralEntry.network,
    nonce: pendulumNonce,
    phase: "pendulumToAssethub",
    signer: pendulumEphemeralEntry.address,
    txData: encodeSubmittableExtrinsic(pendulumToAssethubXcmTransaction)
  });
  pendulumNonce++;

  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: pendulumNonce
  });
  pendulumNonce++;

  return { nablaStateMeta, pendulumNonce };
}

export async function createAveniaToEvmFlow(
  quote: QuoteTicketAttributes,
  pendulumEphemeralEntry: AccountMeta,
  moonbeamEphemeralAddress: string,
  outputTokenDetails: OnChainTokenDetails,
  inputTokenPendulumDetails: PendulumTokenDetails,
  outputTokenPendulumDetails: PendulumTokenDetails,
  unsignedTxs: UnsignedTx[]
) {
  let pendulumNonce = 0;
  const { nextNonce: nonceAfterNabla, stateMeta: nablaStateMeta } = await createNablaSwapTransactions(
    {
      account: pendulumEphemeralEntry,
      inputTokenPendulumDetails,
      outputTokenPendulumDetails,
      quote
    },
    unsignedTxs,
    pendulumNonce
  );
  pendulumNonce = nonceAfterNabla;

  pendulumNonce = await addFeeDistributionTransaction(quote, pendulumEphemeralEntry, unsignedTxs, pendulumNonce);

  const pendulumCleanupTx = await createPendulumCleanupTx({
    account: pendulumEphemeralEntry,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails
  });

  const pendulumToMoonbeamXcmTransaction = await createPendulumToMoonbeamTransfer(
    moonbeamEphemeralAddress,
    quote.metadata.onrampOutputAmountMoonbeamRaw,
    outputTokenDetails.pendulumRepresentative.currencyId
  );

  unsignedTxs.push({
    meta: {},
    network: pendulumEphemeralEntry.network,
    nonce: pendulumNonce,
    phase: "pendulumToMoonbeam",
    signer: pendulumEphemeralEntry.address,
    txData: encodeSubmittableExtrinsic(pendulumToMoonbeamXcmTransaction)
  });
  pendulumNonce++;

  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: pendulumNonce
  });
  pendulumNonce++;

  return { nablaStateMeta, pendulumNonce };
}
