import {
  AccountMeta,
  AMM_MINIMUM_OUTPUT_HARD_MARGIN,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  addAdditionalTransactionsToMeta,
  EvmTokenDetails,
  EvmTransactionData,
  encodeSubmittableExtrinsic,
  FiatToken,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  getPendulumDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
  Networks,
  PaymentData,
  PENDULUM_USDC_ASSETHUB,
  PENDULUM_USDC_AXL,
  PendulumDetails,
  PendulumTokenDetails,
  StellarTokenDetails,
  UnsignedTx
} from "@packages/shared";
import Big from "big.js";
import { Keypair } from "stellar-sdk";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import { QuoteTicketAttributes, QuoteTicketMetadata } from "../../../models/quoteTicket.model";
import { ApiManager } from "../pendulum/apiManager";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import { StateMetadata } from "../phases/meta-state-types";
import { priceFeedService } from "../priceFeed.service";
import { encodeEvmTransactionData } from "./index";
import { createNablaTransactionsForOfframp } from "./nabla";
import { preparePendulumCleanupTransaction } from "./pendulum/cleanup";
import { prepareSpacewalkRedeemTransaction } from "./spacewalk/redeem";
import { createOfframpSquidrouterTransactions } from "./squidrouter/offramp";
import { buildPaymentAndMergeTx } from "./stellar/offrampTransaction";
import { createAssethubToPendulumXCM } from "./xcm/assethubToPendulum";
import { createPendulumToMoonbeamTransfer } from "./xcm/pendulumToMoonbeam";

/**
 * Creates a pre-signed fee distribution transaction for the distribute-fees-handler phase
 * @param quote The quote ticket
 * @returns The encoded transaction
 */
async function createFeeDistributionTransaction(quote: QuoteTicketAttributes): Promise<string | null> {
  const apiManager = ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  const metadata = quote.metadata as QuoteTicketMetadata;
  if (!metadata.usdFeeStructure) {
    logger.warn("No USD fee structure found in quote metadata, skipping fee distribution transaction");
    logger.warn("No USD fee structure found in quote metadata, skipping fee distribution transaction");
    return null;
  }

  const networkFeeUSD = metadata.usdFeeStructure.network;
  const vortexFeeUSD = metadata.usdFeeStructure.vortex;
  const partnerMarkupFeeUSD = metadata.usdFeeStructure.partnerMarkup;

  // Get payout addresses
  const vortexPartner = await Partner.findOne({
    where: { isActive: true, name: "vortex" }
  });
  if (!vortexPartner || !vortexPartner.payoutAddress) {
    logger.warn("Vortex partner or payout address not found, skipping fee distribution transaction");
    logger.warn("Vortex partner or payout address not found, skipping fee distribution transaction");
    return null;
  }
  const vortexPayoutAddress = vortexPartner.payoutAddress;

  let partnerPayoutAddress = null;
  if (quote.partnerId) {
    const quotePartner = await Partner.findOne({
      where: { id: quote.partnerId, isActive: true }
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
  const stablecoinCurrencyId = stablecoinDetails.pendulumCurrencyId;
  const stablecoinDecimals = stablecoinDetails.pendulumDecimals;

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
async function createEvmSourceTransactions(
  params: {
    userAddress: string;
    pendulumEphemeralAddress: string;
    fromNetwork: Networks;
    inputAmountRaw: string;
    inputTokenDetails: EvmTokenDetails;
  },
  unsignedTxs: UnsignedTx[]
): Promise<Partial<StateMetadata>> {
  const { userAddress, pendulumEphemeralAddress, fromNetwork, inputAmountRaw, inputTokenDetails } = params;

  const { approveData, swapData, squidRouterReceiverId, squidRouterReceiverHash } = await createOfframpSquidrouterTransactions({
    fromAddress: userAddress,
    fromNetwork,
    inputTokenDetails,
    pendulumAddressDestination: pendulumEphemeralAddress,
    rawAmount: inputAmountRaw
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
    squidRouterReceiverHash,
    squidRouterReceiverId
  };
}

/**
 * Creates transactions for AssetHub source networks
 * @param params Transaction parameters
 * @param unsignedTxs Array to add transactions to
 */
async function createAssetHubSourceTransactions(
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
async function createNablaSwapTransactions(
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

  // For offramps, all fees except for the anchor fee are paid out (-> deducted) before the swap.
  // Thus, we need to adjust the input amount to account for all deducted fees.
  const anchorFeeInInputCurrency = await priceFeedService.convertCurrency(
    quote.fee.anchor,
    quote.outputCurrency,
    quote.inputCurrency
  );
  const totalFeeInInputCurrency = await priceFeedService.convertCurrency(
    quote.fee.total,
    quote.outputCurrency,
    quote.inputCurrency
  );
  const inputAmountBeforeSwapRaw = multiplyByPowerOfTen(
    new Big(quote.inputAmount).minus(totalFeeInInputCurrency).plus(anchorFeeInInputCurrency),
    inputTokenPendulumDetails.pendulumDecimals
  ).toFixed(0, 0);

  // For these minimums, we use the output amount after all fees have been deducted except for the anchor fee.
  const anchorFeeInOutputCurrency = quote.fee.anchor; // No conversion needed, already in output currency
  const outputBeforeAnchorFee = new Big(quote.outputAmount).minus(anchorFeeInOutputCurrency);
  const nablaSoftMinimumOutput = outputBeforeAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
  const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
    nablaSoftMinimumOutput,
    outputTokenPendulumDetails.pendulumDecimals
  ).toFixed();

  const nablaHardMinimumOutput = outputBeforeAnchorFee.mul(1 - AMM_MINIMUM_OUTPUT_HARD_MARGIN).toFixed(0, 0);
  const nablaHardMinimumOutputRaw = multiplyByPowerOfTen(
    new Big(nablaHardMinimumOutput),
    outputTokenPendulumDetails.pendulumDecimals
  ).toFixed(0, 0);

  const { approve, swap } = await createNablaTransactionsForOfframp(
    inputAmountBeforeSwapRaw,
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
      inputAmountBeforeSwapRaw,
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
async function addFeeDistributionTransaction(
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
async function createBRLTransactions(
  params: {
    brlaEvmAddress: string;
    outputAmountRaw: string;
    outputTokenDetails: PendulumDetails;
    account: AccountMeta;
    taxId: string;
    pixDestination: string;
    receiverTaxId: string;
  },
  unsignedTxs: UnsignedTx[],
  pendulumCleanupTx: Omit<UnsignedTx, "nonce">,
  nextNonce: number
): Promise<{ nextNonce: number; stateMeta: Partial<StateMetadata> }> {
  const { brlaEvmAddress, outputAmountRaw, outputTokenDetails, account, taxId, pixDestination, receiverTaxId } = params;

  const pendulumToMoonbeamTransaction = await createPendulumToMoonbeamTransfer(
    brlaEvmAddress,
    outputAmountRaw,
    outputTokenDetails.pendulumCurrencyId
  );

  unsignedTxs.push({
    meta: {},
    network: account.network,
    nonce: nextNonce,
    phase: "pendulumToMoonbeam",
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
async function createStellarTransactions(
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
async function createStellarPaymentTransactions(
  params: {
    account: AccountMeta;
    outputAmountUnits: Big;
    outputTokenDetails: StellarTokenDetails;
    stellarPaymentData: PaymentData;
  },
  unsignedTxs: UnsignedTx[]
): Promise<void> {
  const { account, outputAmountUnits, outputTokenDetails, stellarPaymentData } = params;

  const { paymentTransactions, mergeAccountTransactions, createAccountTransactions, expectedSequenceNumber } =
    await buildPaymentAndMergeTx({
      amountToAnchorUnits: outputAmountUnits.toFixed(),
      ephemeralAccountId: account.address,
      paymentData: stellarPaymentData,
      tokenConfigStellar: outputTokenDetails
    });

  const createAccountPrimaryTx: UnsignedTx = {
    meta: {
      expectedSequenceNumber
    },
    network: account.network,
    nonce: 0,
    phase: "stellarCreateAccount",
    signer: account.address,
    txData: createAccountTransactions[0].tx
  };

  const paymentTransactionPrimary: UnsignedTx = {
    meta: {
      expectedSequenceNumber
    },
    network: account.network,
    nonce: 1,
    phase: "stellarPayment",
    signer: account.address,
    txData: paymentTransactions[0].tx
  };

  const mergeAccountTransactionPrimary: UnsignedTx = {
    meta: {},
    network: account.network,
    nonce: 2,
    phase: "stellarCleanup",
    signer: account.address,
    txData: mergeAccountTransactions[0].tx
  };

  const createAccountMultiSignedTxs = createAccountTransactions.map((tx, index) => ({
    ...createAccountPrimaryTx,
    nonce: createAccountPrimaryTx.nonce + index,
    txData: tx.tx
  }));

  const createAccountTx = addAdditionalTransactionsToMeta(createAccountPrimaryTx, createAccountMultiSignedTxs);
  unsignedTxs.push(createAccountTx);

  const paymentTransactionMultiSignedTxs = paymentTransactions.map((tx, index) => ({
    ...paymentTransactionPrimary,
    nonce: paymentTransactionPrimary.nonce + index,
    txData: tx.tx
  }));

  const paymentTransaction = addAdditionalTransactionsToMeta(paymentTransactionPrimary, paymentTransactionMultiSignedTxs);
  unsignedTxs.push(paymentTransaction);

  const mergeAccountTransactionMultiSignedTxs = mergeAccountTransactions.map((tx, index) => ({
    ...mergeAccountTransactionPrimary,
    nonce: mergeAccountTransactionPrimary.nonce + index,
    txData: tx.tx
  }));

  const mergeAccountTx = addAdditionalTransactionsToMeta(mergeAccountTransactionPrimary, mergeAccountTransactionMultiSignedTxs);
  unsignedTxs.push(mergeAccountTx);
}

interface OfframpTransactionParams {
  quote: QuoteTicketAttributes;
  signingAccounts: AccountMeta[];
  stellarPaymentData?: PaymentData;
  userAddress?: string;
  pixDestination?: string;
  taxId?: string;
  receiverTaxId?: string;
  brlaEvmAddress?: string;
}

export async function prepareOfframpTransactions({
  quote,
  signingAccounts,
  stellarPaymentData,
  userAddress,
  pixDestination,
  taxId,
  receiverTaxId,
  brlaEvmAddress
}: OfframpTransactionParams): Promise<{
  unsignedTxs: UnsignedTx[];
  stateMeta: Partial<StateMetadata>;
}> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta: Partial<StateMetadata> = {};

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);

  if (!inputTokenDetails) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }

  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0);

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);

  if (!quote.metadata?.offrampAmountBeforeAnchorFees) {
    throw new Error("Quote metadata is missing offrampAmountBeforeAnchorFees");
  }

  const offrampAmountBeforeAnchorFeesUnits = new Big(quote.metadata.offrampAmountBeforeAnchorFees);
  const offrampAmountBeforeAnchorFeesRaw = multiplyByPowerOfTen(
    offrampAmountBeforeAnchorFeesUnits,
    outputTokenDetails.decimals
  ).toFixed(0, 0);

  if (stellarPaymentData && stellarPaymentData.amount) {
    const stellarAmount = new Big(stellarPaymentData.amount);
    if (!stellarAmount.eq(offrampAmountBeforeAnchorFeesUnits)) {
      throw new Error(
        `Stellar amount ${stellarAmount.toString()} not equal to expected payment ${offrampAmountBeforeAnchorFeesUnits.toString()}`
      );
    }
  }

  const stellarEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Stellar);
  if (!stellarEphemeralEntry) {
    throw new Error("Stellar ephemeral not found");
  }

  const pendulumEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  // Initialize state metadata
  stateMeta = {
    inputTokenPendulumDetails,
    outputAmountBeforeFinalStep: {
      raw: offrampAmountBeforeAnchorFeesRaw,
      units: offrampAmountBeforeAnchorFeesUnits.toFixed()
    },
    outputTokenPendulumDetails,
    outputTokenType: quote.outputCurrency,
    pendulumEphemeralAddress: pendulumEphemeralEntry.address
  };

  if (!userAddress) {
    throw new Error("User address must be provided for offramping.");
  }

  if (isEvmTokenDetails(inputTokenDetails)) {
    const evmSourceMetadata = await createEvmSourceTransactions(
      {
        fromNetwork,
        inputAmountRaw,
        inputTokenDetails,
        pendulumEphemeralAddress: pendulumEphemeralEntry.address,
        userAddress
      },
      unsignedTxs
    );

    stateMeta = {
      ...stateMeta,
      ...evmSourceMetadata
    };
  } else {
    await createAssetHubSourceTransactions(
      {
        inputAmountRaw,
        pendulumEphemeralAddress: pendulumEphemeralEntry.address,
        userAddress
      },
      unsignedTxs,
      fromNetwork
    );
  }

  // Process each ephemeral account
  for (const account of signingAccounts) {
    logger.info(`Processing account ${account.address} on network ${account.network}`);
    const accountNetworkId = getNetworkId(account.network);

    // Skip Moonbeam account processing (empty block in original code)
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // No transactions needed for Moonbeam ephemeral at this stage
    }
    // Process Pendulum account
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      // Initialize nonce counter for Pendulum transactions
      let pendulumNonce = 0;

      // Add fee distribution transaction if available using helper function
      pendulumNonce = await addFeeDistributionTransaction(quote, account, unsignedTxs, pendulumNonce);

      // Create Nabla swap transactions using helper function
      const nablaResult = await createNablaSwapTransactions(
        {
          account,
          inputTokenPendulumDetails,
          outputTokenPendulumDetails,
          quote
        },
        unsignedTxs,
        pendulumNonce
      );

      pendulumNonce = nablaResult.nextNonce;
      stateMeta = {
        ...stateMeta,
        ...nablaResult.stateMeta
      };

      // Prepare cleanup transaction to be added later with the correct nonce
      const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
        inputTokenPendulumDetails.pendulumCurrencyId,
        outputTokenPendulumDetails.pendulumCurrencyId
      );

      const pendulumCleanupTx: Omit<UnsignedTx, "nonce"> = {
        meta: {},
        network: account.network,
        phase: "pendulumCleanup",
        signer: account.address,
        txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction)
      };

      if (quote.outputCurrency === FiatToken.BRL) {
        if (!brlaEvmAddress || !pixDestination || !taxId || !receiverTaxId) {
          throw new Error(
            "brlaEvmAddress, pixDestination, receiverTaxId and taxId parameters must be provided for offramp to BRL"
          );
        }

        const brlResult = await createBRLTransactions(
          {
            account,
            brlaEvmAddress,
            outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
            outputTokenDetails,
            pixDestination,
            receiverTaxId,
            taxId
          },
          unsignedTxs,
          pendulumCleanupTx,
          pendulumNonce
        );

        pendulumNonce = brlResult.nextNonce;
        stateMeta = {
          ...stateMeta,
          ...brlResult.stateMeta
        };
      } else {
        if (!isStellarOutputTokenDetails(outputTokenDetails)) {
          throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
        }

        if (!stellarPaymentData?.anchorTargetAccount) {
          throw new Error("Stellar payment data must be provided for offramp");
        }

        // Use helper function to create Stellar transactions
        const stellarResult = await createStellarTransactions(
          {
            account,
            outputAmountRaw: offrampAmountBeforeAnchorFeesRaw,
            outputTokenDetails,
            stellarEphemeralEntry,
            stellarPaymentData
          },
          unsignedTxs,
          pendulumCleanupTx,
          pendulumNonce
        );

        pendulumNonce = stellarResult.nextNonce;
        stateMeta = {
          ...stateMeta,
          ...stellarResult.stateMeta
        };
      }
    }
    // Process Stellar account for non-BRL outputs using helper function
    else if (accountNetworkId === getNetworkId(Networks.Stellar) && quote.outputCurrency !== FiatToken.BRL) {
      if (!isStellarOutputTokenDetails(outputTokenDetails)) {
        throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
      }

      if (!stellarPaymentData) {
        throw new Error("Stellar payment data must be provided for offramp");
      }

      await createStellarPaymentTransactions(
        {
          account,
          outputAmountUnits: offrampAmountBeforeAnchorFeesUnits,
          outputTokenDetails,
          stellarPaymentData
        },
        unsignedTxs
      );
    }
  }

  return { stateMeta, unsignedTxs }; // Return the unsigned transactions and state meta
}
