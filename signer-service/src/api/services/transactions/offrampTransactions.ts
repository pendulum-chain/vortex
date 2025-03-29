import {
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN,
  FiatToken,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
  Networks,
  getPendulumDetails,
} from 'shared';
import Big from 'big.js';
import { Keypair } from 'stellar-sdk';
import { QuoteTicketAttributes } from '../../../models/quoteTicket.model';
import { UnsignedTx } from '../ramp/base.service';
import { AccountMeta } from '../ramp/ramp.service';
import { createOfframpSquidrouterTransactions } from './squidrouter/offramp';
import { encodeEvmTransactionData, encodeSubmittableExtrinsic } from './index';
import { createNablaTransactionsForQuote } from './nabla';
import { multiplyByPowerOfTen } from '../pendulum/helpers';
import { prepareSpacewalkRedeemTransaction } from './spacewalk/redeem';
import { buildPaymentAndMergeTx, PaymentData } from './stellar/offrampTransaction';
import { createPendulumToMoonbeamTransfer } from './xcm/pendulumToMoonbeam';

export async function prepareOfframpTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  stellarPaymentData?: PaymentData,
  userAddress?: string,
): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: unknown }> {
  const unsignedTxs: UnsignedTx[] = [];
  let stateMeta = {};

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

  const stellarEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Stellar);
  if (!stellarEphemeralEntry) {
    throw new Error('Stellar ephemeral not found');
  }

  const pendulumEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error('Pendulum ephemeral not found');
  }

  const moonbeamEphemeralEntry = signingAccounts.find((ephemeral) => ephemeral.network === Networks.Moonbeam);
  if (!moonbeamEphemeralEntry) {
    throw new Error('Moonbeam ephemeral not found');
  }

  const inputTokenPendulumDetails = getPendulumDetails(quote.inputCurrency, fromNetwork);
  const outputTokenPendulumDetails = getPendulumDetails(quote.outputCurrency);

  // If coming from evm chain, we need to pass the proper squidrouter transactions
  // to the user.
  if (isEvmTokenDetails(inputTokenDetails)) {
    if (!userAddress) {
      throw new Error('User address must be provided for offramping from EVM network.');
    }

    const { approveData, swapData } = await createOfframpSquidrouterTransactions({
      inputTokenDetails,
      fromNetwork,
      rawAmount: inputAmountRaw,
      pendulumAddressDestination: pendulumEphemeralEntry.address,
      fromAddress: userAddress,
    });
    console.log(approveData);
    console.log(swapData);
    unsignedTxs.push({
      tx_data: encodeEvmTransactionData(approveData),
      phase: 'squidrouterApprove',
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
    unsignedTxs.push({
      tx_data: encodeEvmTransactionData(swapData),
      phase: 'squidrouterSwap',
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
  }
  // Create unsigned transactions for each ephemeral account
  for (const account of signingAccounts) {
    console.log(`Processing account ${account.address} on network ${account.network}`);
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
      // TODO implement creation of unsigned ephemeral tx for Moonbeam -> Pendulum
    }
    // If network is Pendulum, create all the swap transactions
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
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
        tx_data: approveTransaction,
        phase: 'nablaApprove',
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: swapTransaction,
        phase: 'nablaSwap',
        network: account.network,
        nonce: 1,
        signer: account.address,
      });

      stateMeta = {
        ...stateMeta,
        pendulumEphemeralAddress: account.address,
        nablaSoftMinimumOutputRaw,
        pendulumAmountRaw: outputAmountBeforeFeesRaw,
        inputTokenPendulumDetails,
        outputTokenPendulumDetails,
      };

      if (quote.outputCurrency === FiatToken.BRL) {
        const pendulumToMoonbeamTransaction = await createPendulumToMoonbeamTransfer(
          moonbeamEphemeralEntry.address,
          outputAmountBeforeFeesRaw,
          outputTokenDetails.pendulumCurrencyId,
        );

        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(pendulumToMoonbeamTransaction),
          phase: 'pendulumToMoonbeam',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });

        stateMeta = {
          ...stateMeta,
          pendulumEphemeralAddress: account.address,
        };
      } else {
        if (!isStellarOutputTokenDetails(outputTokenDetails)) {
          throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
        }

        if (!stellarPaymentData?.offrampingAccount) {
          throw new Error('Stellar payment data must be provided for offramp');
        }

        const stellarTargetAccountRaw = Keypair.fromPublicKey(stellarPaymentData.offrampingAccount).rawPublicKey();
        const spacewalkRedeemTransaction = await prepareSpacewalkRedeemTransaction({
          outputAmountRaw: outputAmountBeforeFeesRaw,
          stellarTargetAccountRaw,
          outputTokenDetails,
          executeSpacewalkNonce: 0,
        });

        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
          phase: 'spacewalkRedeem',
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Stellar) && quote.outputCurrency !== FiatToken.BRL) {
      if (!isStellarOutputTokenDetails(outputTokenDetails)) {
        throw new Error(`Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`);
      }
      if (!stellarPaymentData) {
        throw new Error('Stellar payment data must be provided for offramp');
      }

      const { paymentTransaction, mergeAccountTransaction, startingSequenceNumber } = await buildPaymentAndMergeTx(
        account.address,
        stellarPaymentData,
        outputTokenDetails,
      );

      unsignedTxs.push({
        tx_data: paymentTransaction,
        phase: 'stellarPayment',
        network: account.network,
        nonce: Number(startingSequenceNumber),
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: mergeAccountTransaction,
        phase: 'stellarCleanup',
        network: account.network,
        nonce: Number(startingSequenceNumber) + 1,
        signer: account.address,
      });
    }
  }

  return { unsignedTxs, stateMeta }; // Return the unsigned transactions and state meta
}
