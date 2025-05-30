import {
  AccountMeta,
  addAdditionalTransactionsToMeta,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
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
  UnsignedTx,
} from 'shared';

import Big from 'big.js';
import { Keypair } from 'stellar-sdk';
import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { createOfframpSquidrouterTransactions } from './squidrouter/offramp';
import { encodeEvmTransactionData } from './index';
import { createNablaTransactionsForQuote } from './nabla';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { prepareSpacewalkRedeemTransaction } from './spacewalk/redeem';
import { buildPaymentAndMergeTx } from './stellar/offrampTransaction';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';
import { StateMetadata } from '../phases/meta-state-types';
import { preparePendulumCleanupTransaction } from './pendulum/cleanup';
import { createAssethubToPendulumXCM } from './xcm/assethubToPendulum';
import logger from '../../../config/logger';

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
  brlaEvmAddress,
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

  // validate input token. At this point should be validated by the quote endpoint,
  // but we need it for the type check
  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }

  // TODO we could compress this into a helper.
  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency)!;
  const inputAmountRaw = multiplyByPowerOfTen(new Big(quote.inputAmount), inputTokenDetails.decimals).toFixed(0, 0); // Raw amount on initial chain.

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);
  const outputAmountBeforeFees = new Big(quote.outputAmount).add(new Big(quote.fee));
  const outputAmountBeforeFeesRaw = multiplyByPowerOfTen(outputAmountBeforeFees, outputTokenDetails.decimals).toFixed(
    0,
    0,
  );

  // Validate output amount from UI/sep24
  if (stellarPaymentData && stellarPaymentData.amount) {
    const stellarAmount = new Big(stellarPaymentData.amount);
    if (!stellarAmount.eq(outputAmountBeforeFees)) {
      throw new Error(
        `Stellar amount ${stellarAmount.toString()} not equal to expected payment ${outputAmountBeforeFees.toString()}`,
      );
    }
  }

  const stellarEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Stellar);
  if (!stellarEphemeralEntry) {
    throw new Error('Stellar ephemeral not found');
  }

  const pendulumEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error('Pendulum ephemeral not found');
  }

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  // add common data to state metadata, for later use on the executors
  stateMeta = {
    outputTokenType: quote.outputCurrency,
    inputTokenPendulumDetails,
    outputTokenPendulumDetails,
    outputAmountBeforeFees: { units: outputAmountBeforeFees.toFixed(), raw: outputAmountBeforeFeesRaw },
    pendulumEphemeralAddress: pendulumEphemeralEntry.address,
  };

  // If coming from evm chain, we need to pass the proper squidrouter transactions
  // to the user.
  if (isEvmTokenDetails(inputTokenDetails)) {
    if (!userAddress) {
      throw new Error('User address must be provided for offramping from EVM network.');
    }

    const { approveData, swapData, squidRouterReceiverId, squidRouterReceiverHash } =
      await createOfframpSquidrouterTransactions({
        inputTokenDetails,
        fromNetwork,
        rawAmount: inputAmountRaw,
        pendulumAddressDestination: pendulumEphemeralEntry.address,
        fromAddress: userAddress,
      });
    unsignedTxs.push({
      txData: encodeEvmTransactionData(approveData) as any,
      phase: 'squidrouterApprove',
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
    unsignedTxs.push({
      txData: encodeEvmTransactionData(swapData) as any,
      phase: 'squidrouterSwap',
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });

    stateMeta = {
      ...stateMeta,
      squidRouterReceiverId,
      squidRouterReceiverHash,
    };
  } else {
    if (!userAddress) {
      throw new Error('User address must be provided for offramping.');
    }

    // Create Assethub to Pendulum transaction
    const assethubToPendulumTransaction = await createAssethubToPendulumXCM(
      pendulumEphemeralEntry.address,
      'usdc',
      inputAmountRaw,
    );
    logger.info('assethub to pendulum txs done');
    unsignedTxs.push({
      txData: encodeSubmittableExtrinsic(assethubToPendulumTransaction),
      phase: 'assethubToPendulum',
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
  }

  // Create unsigned transactions for each ephemeral account
  for (const account of signingAccounts) {
    logger.info(`Processing account ${account.address} on network ${account.network}`);
    const accountNetworkId = getNetworkId(account.network);

    if (!isOnChainToken(quote.inputCurrency)) {
      throw new Error(`Input currency cannot be fiat token ${quote.inputCurrency} for offramp.`);
    }
    const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
    if (!inputTokenDetails) {
      throw new Error(`Token ${quote.inputCurrency} is not supported for offramp`);
    }

    // If network is Moonbeam, we need to create a second transaction to send the funds to the user
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
    }
    // If network is Pendulum, create all the swap transactions
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const inputAmountBeforeSwapRaw = multiplyByPowerOfTen(
        new Big(quote.inputAmount),
        inputTokenPendulumDetails.pendulumDecimals,
      ).toFixed(0, 0);

      const nablaSoftMinimumOutput = outputAmountBeforeFees.mul(1 - AMM_MINIMUM_OUTPUT_SOFT_MARGIN);
      const nablaSoftMinimumOutputRaw = multiplyByPowerOfTen(
        nablaSoftMinimumOutput,
        inputTokenPendulumDetails.pendulumDecimals,
      ).toFixed();

      const { approveTransaction, swapTransaction } = await createNablaTransactionsForQuote(
        quote,
        account,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
      );

      unsignedTxs.push({
        txData: approveTransaction,
        phase: 'nablaApprove',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        txData: swapTransaction,
        phase: 'nablaSwap',
        network: account.network,
        nonce: 1,
        signer: account.address,
      });
      stateMeta = {
        ...stateMeta,
        nablaSoftMinimumOutputRaw,
        inputAmountBeforeSwapRaw,
      };

      const pendulumCleanupTransaction = await preparePendulumCleanupTransaction(
        inputTokenPendulumDetails.pendulumCurrencyId,
        outputTokenPendulumDetails.pendulumCurrencyId,
      );
      unsignedTxs.push({
        txData: encodeSubmittableExtrinsic(pendulumCleanupTransaction),
        phase: 'pendulumCleanup',
        network: account.network,
        nonce: 3, // Will always come after either pendulumToMoonbeam or spacewalkRedeem.
        signer: account.address,
      });

      if (quote.outputCurrency === FiatToken.BRL) {
        if (!brlaEvmAddress || !pixDestination || !taxId || !receiverTaxId) {
          throw new Error(
            'brlaEvmAddress, pixDestination, receiverTaxId and taxId parameters must be provided for offramp to BRL',
          );
        }

        const pendulumToMoonbeamTransaction = await createPendulumToMoonbeamTransfer(
          brlaEvmAddress,
          outputAmountBeforeFeesRaw,
          outputTokenDetails.pendulumCurrencyId,
        );
        unsignedTxs.push({
          txData: encodeSubmittableExtrinsic(pendulumToMoonbeamTransaction),
          phase: 'pendulumToMoonbeam',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });

        stateMeta = {
          ...stateMeta,
          taxId,
          brlaEvmAddress,
          pixDestination,
          receiverTaxId,
        };
      } else {
        if (!isStellarOutputTokenDetails(outputTokenDetails)) {
          throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
        }

        if (!stellarPaymentData?.anchorTargetAccount) {
          throw new Error('Stellar payment data must be provided for offramp');
        }
        const executeSpacewalkNonce = 2;

        const stellarEphemeralAccountRaw = Keypair.fromPublicKey(stellarEphemeralEntry.address).rawPublicKey();
        const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction({
          outputAmountRaw: outputAmountBeforeFeesRaw,
          stellarEphemeralAccountRaw,
          outputTokenDetails,
          executeSpacewalkNonce: 2,
        });

        unsignedTxs.push({
          txData: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
          phase: 'spacewalkRedeem',
          network: account.network,
          nonce: executeSpacewalkNonce,
          signer: account.address,
        });

        stateMeta = {
          ...stateMeta,
          stellarTarget: {
            stellarTargetAccountId: stellarPaymentData.anchorTargetAccount,
            stellarTokenDetails: outputTokenDetails,
          },
          stellarEphemeralAccountId: stellarEphemeralEntry.address,
          executeSpacewalkNonce,
        };
      }
    } else if (accountNetworkId === getNetworkId(Networks.Stellar) && quote.outputCurrency !== FiatToken.BRL) {
      if (!isStellarOutputTokenDetails(outputTokenDetails)) {
        throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
      }
      if (!stellarPaymentData) {
        throw new Error('Stellar payment data must be provided for offramp');
      }
      const { paymentTransactions, mergeAccountTransactions, createAccountTransactions, expectedSequenceNumber } =
        await buildPaymentAndMergeTx({
          ephemeralAccountId: account.address,
          amountToAnchorUnits: outputAmountBeforeFees.toFixed(),
          paymentData: stellarPaymentData,
          tokenConfigStellar: outputTokenDetails,
        });

      const createAccountPrimaryTx: UnsignedTx = {
        txData: createAccountTransactions[0].tx,
        phase: 'stellarCreateAccount',
        network: account.network,
        nonce: 0,
        signer: account.address,
      };

      const paymentTransactionPrimary: UnsignedTx = {
        txData: paymentTransactions[0].tx,
        phase: 'stellarPayment',
        network: account.network,
        nonce: 1,
        signer: account.address,
        meta: {
          expectedSequenceNumber,
        },
      };

      const mergeAccountTransactionPrimary: UnsignedTx = {
        txData: mergeAccountTransactions[0].tx,
        phase: 'stellarCleanup',
        network: account.network,
        nonce: 2,
        signer: account.address,
        meta: {
          expectedSequenceNumber,
        },
      };

      const createAccountMultiSignedTxs = createAccountTransactions.map((tx, index) => ({
        ...createAccountPrimaryTx,
        txData: tx.tx,
        nonce: createAccountPrimaryTx.nonce + index,
      }));

      const createAccountTx = addAdditionalTransactionsToMeta(createAccountPrimaryTx, createAccountMultiSignedTxs);
      unsignedTxs.push(createAccountTx);

      const paymentTransactionMultiSignedTxs = paymentTransactions.map((tx, index) => ({
        ...paymentTransactionPrimary,
        txData: tx.tx,
        nonce: paymentTransactionPrimary.nonce + index,
      }));

      const paymentTransaction = addAdditionalTransactionsToMeta(
        paymentTransactionPrimary,
        paymentTransactionMultiSignedTxs,
      );
      unsignedTxs.push(paymentTransaction);

      const mergeAccountTransactionMultiSignedTxs = mergeAccountTransactions.map((tx, index) => ({
        ...mergeAccountTransactionPrimary,
        txData: tx.tx,
        nonce: mergeAccountTransactionPrimary.nonce + index,
      }));
      const mergeAccountTx = addAdditionalTransactionsToMeta(
        mergeAccountTransactionPrimary,
        mergeAccountTransactionMultiSignedTxs,
      );
      unsignedTxs.push(mergeAccountTx);
    }
  }

  return { unsignedTxs, stateMeta }; // Return the unsigned transactions and state meta
}
