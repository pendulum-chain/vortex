import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  ApiManager,
  addAdditionalTransactionsToMeta,
  createAssethubToPendulumXCM,
  createNablaTransactionsForOfframp,
  createOfframpSquidrouterTransactions,
  createPendulumToMoonbeamTransfer,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  FiatToken,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isStellarOutputTokenDetails,
  Networks,
  PaymentData,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  PendulumTokenDetails,
  StellarTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { Keypair } from "stellar-sdk";
import logger from "../../../../../config/logger";
import Partner from "../../../../../models/partner.model";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";
import { multiplyByPowerOfTen } from "../../../pendulum/helpers";
import { StateMetadata } from "../../../phases/meta-state-types";
import { encodeEvmTransactionData } from "../../index";
import { preparePendulumCleanupTransaction } from "../../pendulum/cleanup";
import { prepareSpacewalkRedeemTransaction } from "../../spacewalk/redeem";
import { buildPaymentAndMergeTx } from "../../stellar/offrampTransaction";

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase
 * @param quote The quote ticket
 * @returns The encoded transaction
 */
export async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  const usdFeeStructure = quote.metadata.fees?.usd;
  if (!usdFeeStructure) {
    logger.warn("No USD fee structure found in quote metadata, skipping fee distribution transaction");
    return null;
  }

  const networkFeeUSD = usdFeeStructure.network;
  const vortexFeeUSD = usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = usdFeeStructure.partnerMarkup;

  // Get payout addresses
  const vortexPartner = await Partner.findOne({
    where: { isActive: true, name: "vortex", rampType: quote.rampType }
  });
  if (!vortexPartner || !vortexPartner.payoutAddress) {
    logger.warn("Vortex partner or payout address not found, skipping fee distribution transaction");
    return null;
  }
  const vortexPayoutAddress = vortexPartner.payoutAddress;

  let partnerPayoutAddress = null;
  if (quote.partnerId) {
    const quotePartner = await Partner.findOne({
      where: { id: quote.partnerId, isActive: true, rampType: quote.rampType }
    });
    if (quotePartner && quotePartner.payoutAddress) {
      partnerPayoutAddress = quotePartner.payoutAddress;
    }
  }

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    logger.warn(`Invalid network for source ${quote.from}, skipping fee distribution transaction`);
    return null;
  }

  // Select stablecoin based on source network
  const isAssetHubSource = fromNetwork === Networks.AssetHub;
  const stablecoinDetails = isAssetHubSource ? PENDULUM_USDC_ASSETHUB : PENDULUM_USDC_AXL;
  const stablecoinCurrencyId = stablecoinDetails.currencyId;
  const stablecoinDecimals = stablecoinDetails.decimals;

  // Convert USD fees to stablecoin raw units
  const networkFeeStablecoinRaw = multiplyByPowerOfTen(networkFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const vortexFeeStablecoinRaw = multiplyByPowerOfTen(vortexFeeUSD, stablecoinDecimals).toFixed(0, 0);
  const partnerMarkupFeeStablecoinRaw = multiplyByPowerOfTen(partnerMarkupFeeUSD, stablecoinDecimals).toFixed(0, 0);

  const transfers = [];

  if (new Big(networkFeeStablecoinRaw).gt(0)) {
    transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, networkFeeStablecoinRaw));
  }

  if (new Big(vortexFeeStablecoinRaw).gt(0)) {
    transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinRaw));
  }

  if (new Big(partnerMarkupFeeStablecoinRaw).gt(0) && partnerPayoutAddress) {
    transfers.push(api.tx.tokens.transferKeepAlive(partnerPayoutAddress, stablecoinCurrencyId, partnerMarkupFeeStablecoinRaw));
  }

  if (transfers.length > 0) {
    const batchTx = api.tx.utility.batchAll(transfers);
    // Create unsigned transaction (don't sign it here)
    return encodeSubmittableExtrinsic(batchTx);
  }

  return null;
}

/**
 * Creates transactions for EVM source networks using Squidrouter
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param stateMeta State metadata to update
 * @returns Updated state metadata
 */
export async function createEvmSourceTransactions(
  params: {
    userAddress: string;
    pendulumEphemeralAddress: string;
    fromNetwork: Networks;
    inputAmountRaw: string;
    fromToken: `0x${string}`;
    toToken: `0x${string}`;
  },
  unsignedTxs: UnsignedTx[]
): Promise<Partial<StateMetadata>> {
  const { userAddress, pendulumEphemeralAddress, fromNetwork, inputAmountRaw, fromToken, toToken } = params;

  const { approveData, swapData, squidRouterReceiverId, squidRouterReceiverHash, squidRouterQuoteId } =
    await createOfframpSquidrouterTransactions({
      fromAddress: userAddress,
      fromNetwork,
      fromToken,
      pendulumAddressDestination: pendulumEphemeralAddress,
      rawAmount: inputAmountRaw,
      toToken
    });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterApprove",
    signer: userAddress,
    txData: encodeEvmTransactionData(approveData) as EvmTransactionData
  });

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "squidRouterSwap",
    signer: userAddress,
    txData: encodeEvmTransactionData(swapData) as EvmTransactionData
  });

  return {
    squidRouterQuoteId,
    squidRouterReceiverHash,
    squidRouterReceiverId
  };
}

/**
 * Creates transactions for AssetHub source networks
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param fromNetwork Source network
 */
export async function createAssetHubSourceTransactions(
  params: {
    userAddress: string;
    pendulumEphemeralAddress: string;
    inputAmountRaw: string;
  },
  unsignedTxs: UnsignedTx[],
  fromNetwork: Networks
): Promise<void> {
  const { userAddress, pendulumEphemeralAddress, inputAmountRaw } = params;

  // Create Assethub to Pendulum transaction
  const assethubToPendulumTransaction = await createAssethubToPendulumXCM(pendulumEphemeralAddress, "usdc", inputAmountRaw);

  logger.info("assethub to pendulum txs done");

  unsignedTxs.push({
    meta: {},
    network: fromNetwork,
    nonce: 0,
    phase: "assethubToPendulum",
    signer: userAddress,
    txData: encodeSubmittableExtrinsic(assethubToPendulumTransaction)
  });
}

/**
 * Creates Nabla swap transactions for Pendulum
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function createNablaSwapTransactions(
  params: {
    quote: QuoteTicketAttributes;
    account: AccountMeta;
    inputTokenPendulumDetails: PendulumTokenDetails;
    outputTokenPendulumDetails: PendulumTokenDetails;
  },
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { quote, account, inputTokenPendulumDetails, outputTokenPendulumDetails } = params;

  if (!quote.metadata.nablaSwap?.inputAmountForSwapRaw) {
    throw new Error("Missing nablaSwap input amount in quote metadata");
  }

  const inputAmountForNablaSwapRaw = quote.metadata.nablaSwap.inputAmountForSwapRaw;
  const outputAmountRaw = Big(quote.metadata.nablaSwap.outputAmountRaw);

  const nablaSoftMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN).toFixed(0, 0);
  const nablaHardMinimumOutputRaw = outputAmountRaw.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN).toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOfframp(
    inputAmountForNablaSwapRaw,
    account,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    nablaHardMinimumOutputRaw
  );

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "nablaApprove",
    signer: account.address,
    txData: approve.transaction
  });
  nextNonce++;

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "nablaSwap",
    signer: account.address,
    txData: swap.transaction
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      nabla: {
        approveExtrinsicOptions: approve.extrinsicOptions,
        swapExtrinsicOptions: swap.extrinsicOptions
      },
      nablaSoftMinimumOutputRaw
    }
  };
}

/**
 * Creates fee distribution transaction
 * @param quote Quote ticket
 * @param account Account metadata
 * @param unsignedTxs Array to add transactions to
 * @param nextNonce Next available nonce
 * @returns Updated nonce
 */
export async function addFeeDistributionTransaction(
  quote: QuoteTicketAttributes,
  account: AccountMeta,
  unsignedTxs: UnsignedTx[],
  nextNonce: number
): Promise<number> {
  const feeDistributionTx = await createFeeDistributionTransaction(quote);

  if (feeDistributionTx) {
    unsignedTxs.push({
      meta: {},
      network: account.network,
      nonce: nextNonce,
      phase: "distributeFees",
      signer: account.address,
      txData: feeDistributionTx
    });
    nextNonce++;
  }

  return nextNonce;
}

/**
 * Creates BRL-specific transactions for Pendulum to Moonbeam transfer
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param pendulumCleanupTx Cleanup transaction template
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function createBRLTransactions(
  params: {
    brlaEvmAddress: string;
    outputAmountRaw: string;
    outputTokenPendulumDetails: PendulumTokenDetails;
    account: AccountMeta;
    taxId: string;
    pixDestination: string;
    receiverTaxId: string;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, "nonce">,
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { brlaEvmAddress, outputAmountRaw, outputTokenPendulumDetails, account, taxId, pixDestination, receiverTaxId } = params;

  const pendulumToMoonbeamTransaction = await createPendulumToMoonbeamTransfer(
    brlaEvmAddress,
    outputAmountRaw,
    outputTokenPendulumDetails.currencyId
  );

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "pendulumToMoonbeamXcm",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(pendulumToMoonbeamTransaction)
  });
  nextNonce++;

  // Add the cleanup transaction with the next nonce
  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: nextNonce
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      brlaEvmAddress,
      pixDestination,
      receiverTaxId,
      taxId
    }
  };
}

/**
 * Creates Stellar-specific transactions for Spacewalk redeem
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 * @param pendulumCleanupTx Cleanup transaction template
 * @param nextNonce Next available nonce
 * @returns Updated nonce and state metadata
 */
export async function createSpacewalkTransactions(
  params: {
    outputAmountRaw: string;
    stellarEphemeralEntry: AccountMeta;
    outputTokenDetails: StellarTokenDetails;
    account: AccountMeta;
    stellarPaymentData: PaymentData;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, "nonce">,
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { outputAmountRaw, stellarEphemeralEntry, outputTokenDetails, account, stellarPaymentData } = params;

  const stellarEphemeralAccountRaw = Keypair.fromPublicKey(stellarEphemeralEntry.address).rawPublicKey();
  const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction({
    executeSpacewalkNonce: nextNonce,
    outputAmountRaw: outputAmountRaw,
    outputTokenDetails,
    stellarEphemeralAccountRaw
  });

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "spacewalkRedeem",
    signer: account.address,
    txData: encodeSubmittableExtrinsic(spacewalkRedeemTransaction)
  });
  const executeSpacewalkNonce = nextNonce;
  nextNonce++;

  // Add the cleanup transaction with the next nonce
  unsignedTxs.push({
    ...pendulumCleanupTx,
    nonce: nextNonce
  });
  nextNonce++;

  return {
    nextNonce,
    stateMeta: {
      executeSpacewalkNonce,
      stellarEphemeralAccountId: stellarEphemeralEntry.address,
      stellarTarget: {
        stellarTargetAccountId: stellarPaymentData.anchorTargetAccount,
        stellarTokenDetails: outputTokenDetails
      }
    }
  };
}

/**
 * Creates Stellar payment and merge transactions
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 */
export async function createStellarPaymentTransactions(
  params: {
    account: AccountMeta;
    outputAmountUnits: Big;
    outputTokenDetails: StellarTokenDetails;
    stellarPaymentData: PaymentData;
  },
  unsignedTxs: UnsignedTx[]
): Promise<void> {
  const { account, outputAmountUnits, outputTokenDetails, stellarPaymentData } = params;

  const { paymentTransactions, mergeAccountTransactions, createAccountTransactions, expectedSequenceNumbers } =
    await buildPaymentAndMergeTx({
      amountToAnchorUnits: outputAmountUnits.toFixed(),
      ephemeralAccountId: account.address,
      paymentData: stellarPaymentData,
      tokenConfigStellar: outputTokenDetails
    });

  const createAccountPrimaryTx: UnsignedTx = {
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[0]
    },
    network: account.network,
    nonce: 0,
    phase: "stellarCreateAccount",
    signer: account.address,
    txData: createAccountTransactions[0].tx
  };

  const paymentTransactionPrimary: UnsignedTx = {
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[0]
    },
    network: account.network,
    nonce: 1,
    phase: "stellarPayment",
    signer: account.address,
    txData: paymentTransactions[0].tx
  };

  const mergeAccountTransactionPrimary: UnsignedTx = {
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[0]
    },
    network: account.network,
    nonce: 2,
    phase: "stellarCleanup",
    signer: account.address,
    txData: mergeAccountTransactions[0].tx
  };

  const createAccountMultiSignedTxs = createAccountTransactions.map((tx, index) => ({
    ...createAccountPrimaryTx,
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[index]
    },
    nonce: createAccountPrimaryTx.nonce + index,
    txData: tx.tx
  }));

  const createAccountTx = addAdditionalTransactionsToMeta(createAccountPrimaryTx, createAccountMultiSignedTxs);
  unsignedTxs.push(createAccountTx);

  const paymentTransactionMultiSignedTxs = paymentTransactions.map((tx, index) => ({
    ...paymentTransactionPrimary,
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[index]
    },
    nonce: paymentTransactionPrimary.nonce + index,
    txData: tx.tx
  }));

  const paymentTransaction = addAdditionalTransactionsToMeta(paymentTransactionPrimary, paymentTransactionMultiSignedTxs);
  unsignedTxs.push(paymentTransaction);

  const mergeAccountTransactionMultiSignedTxs = mergeAccountTransactions.map((tx, index) => ({
    ...mergeAccountTransactionPrimary,
    meta: {
      expectedSequenceNumber: expectedSequenceNumbers[index]
    },
    nonce: mergeAccountTransactionPrimary.nonce + index,
    txData: tx.tx
  }));

  const mergeAccountTx = addAdditionalTransactionsToMeta(mergeAccountTransactionPrimary, mergeAccountTransactionMultiSignedTxs);
  unsignedTxs.push(mergeAccountTx);
}
