import { QuoteTicketAttributes } from "../../../models/quoteTicket.model";
import { UnsignedTx } from "../ramp/base.service";
import { AccountMeta } from "../ramp/ramp.service";
import { createOfframpSquidrouterTransactions } from "./squidrouter/offramp";
import {
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getNetworkId,
  getOnChainTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
  Networks,
} from "shared";
import { encodeEvmTransactionData, encodeSubmittableExtrinsic } from "./index";
import { createNablaTransactionsForQuote } from "./nabla";
import { multiplyByPowerOfTen } from "../pendulum/helpers";
import Big from "big.js";
import { prepareSpacewalkRedeemTransaction } from "./spacewalk/redeem";
import {
  buildPaymentAndMergeTx,
  PaymentData,
} from "./stellar/offrampTransaction";
import { Keypair } from "stellar-sdk";

export async function prepareOfframpTransactions(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  stellarPaymentData?: PaymentData,
  userAddress?: string
): Promise<UnsignedTx[]> {
  const unsignedTxs: UnsignedTx[] = [];

  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }
  const fromNetworkId = getNetworkId(fromNetwork);

  // validate input token. At this point should be validated by the quote endpoint,
  // but we need it for the type check
  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(
      `Input currency must be fiat token for onramp, got ${quote.inputCurrency}`
    );
  }
  const inputTokenDetails = getOnChainTokenDetails(
    fromNetwork,
    quote.inputCurrency
  )!;
  const inputAmountRaw = multiplyByPowerOfTen(
    new Big(quote.inputAmount),
    inputTokenDetails.decimals
  ).toFixed(0, 0); // Raw amount on initial chain.

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(
      `Output currency must be fiat token for offramp, got ${quote.outputCurrency}`
    );
  }
  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);
  const outputAmountBeforeFees = new Big(quote.outputAmount).add(
    new Big(quote.fee)
  );
  const outputAmountRaw = multiplyByPowerOfTen(
    outputAmountBeforeFees,
    outputTokenDetails.decimals
  ).toFixed(0, 0);

  const stellarEphemeralEntry = signingAccounts.find(
    (ephemeral) => ephemeral.network === Networks.Stellar
  );
  if (!stellarEphemeralEntry) {
    throw new Error("Stellar ephemeral not found");
  }

  const pendulumEphemeralEntry = signingAccounts.find(
    (ephemeral) => ephemeral.network === Networks.Pendulum
  );
  if (!pendulumEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  // If coming from evm chain, we need to pass the proper squidrouter transactions
  // to the user.
  if (isEvmTokenDetails(inputTokenDetails)) {
    if (!userAddress) {
      throw new Error(
        "User address must be provided for offramping from EVM network."
      );
    }

    const { approveData, swapData } =
      await createOfframpSquidrouterTransactions({
        inputTokenDetails,
        fromNetwork: fromNetwork,
        rawAmount: inputAmountRaw,
        pendulumAddressDestination: pendulumEphemeralEntry.address,
        fromAddress: userAddress,
      });
    console.log(approveData);
    console.log(swapData);
    unsignedTxs.push({
      tx_data: encodeEvmTransactionData(approveData),
      phase: "squidrouterApprove",
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
    unsignedTxs.push({
      tx_data: encodeEvmTransactionData(swapData),
      phase: "squidrouterSwap",
      network: fromNetwork,
      nonce: 0,
      signer: userAddress,
    });
  }
  // Create unsigned transactions for each ephemeral account
  for (const account of signingAccounts) {
    console.log(
      `Processing account ${account.address} on network ${account.network}`
    );
    const accountNetworkId = getNetworkId(account.network);

    if (!isOnChainToken(quote.inputCurrency)) {
      throw new Error(
        `Input currency cannot be fiat token ${quote.inputCurrency} for offramp.`
      );
    }
    const inputTokenDetails = getOnChainTokenDetails(
      fromNetwork,
      quote.inputCurrency
    );
    if (!inputTokenDetails) {
      throw new Error(
        `Token ${quote.inputCurrency} is not supported for offramp`
      );
    }

    // If network is Moonbeam, we need to create a second transaction to send the funds to the user
    if (accountNetworkId === getNetworkId(Networks.Moonbeam)) {
      // TODO implement creation of unsigned ephemeral tx for Moonbeam -> Pendulum
    }
    // If network is Pendulum, create all the swap transactions
    else if (accountNetworkId === getNetworkId(Networks.Pendulum)) {
      const { approveTransaction, swapTransaction } =
        await createNablaTransactionsForQuote(quote, account);

      unsignedTxs.push({
        tx_data: approveTransaction,
        phase: "approve",
        network: account.network,
        nonce: 0,
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: swapTransaction,
        phase: "swap",
        network: account.network,
        nonce: 1,
        signer: account.address,
      });

      if (quote.outputCurrency === "BRL") {
        // TODO implement creation of unsigned ephemeral tx for Pendulum -> Moonbeam
      } else {
        if (!isStellarOutputTokenDetails(outputTokenDetails)) {
          throw new Error(
            `Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`
          );
        }

        if (!stellarPaymentData?.offrampingAccount) {
          throw new Error("Stellar payment data must be provided for offramp");
        }

        const stellarTargetAccountRaw = Keypair.fromPublicKey(
          stellarPaymentData.offrampingAccount
        ).rawPublicKey();
        const spacewalkRedeemTransaction =
          await prepareSpacewalkRedeemTransaction({
            outputAmountRaw,
            stellarTargetAccountRaw,
            outputTokenDetails,
            executeSpacewalkNonce: 0,
          });

        unsignedTxs.push({
          tx_data: encodeSubmittableExtrinsic(spacewalkRedeemTransaction),
          phase: "spacewalkRedeem",
          network: account.network,
          nonce: 2,
          signer: account.address,
        });
      }
    } else if (accountNetworkId === getNetworkId(Networks.Stellar)) {
      if (!isStellarOutputTokenDetails(outputTokenDetails)) {
        throw new Error(
          `Output currency must be Stellar token for offramp, got ${quote.outputCurrency}`
        );
      }
      if (!stellarPaymentData) {
        throw new Error("Stellar payment data must be provided for offramp");
      }

      const {
        paymentTransaction,
        mergeAccountTransaction,
        startingSequenceNumber,
      } = await buildPaymentAndMergeTx(
        account.address,
        stellarPaymentData,
        outputTokenDetails
      );

      unsignedTxs.push({
        tx_data: paymentTransaction,
        phase: "stellarPayment",
        network: account.network,
        nonce: Number(startingSequenceNumber),
        signer: account.address,
      });

      unsignedTxs.push({
        tx_data: mergeAccountTransaction,
        phase: "stellarCleanup",
        network: account.network,
        nonce: Number(startingSequenceNumber) + 1,
        signer: account.address,
      });
    }
  }

  return unsignedTxs;
}
