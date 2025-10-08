import {
  ApiManager,
  AveniaPayinTicket,
  AveniaPaymentMethod,
  AveniaSwapTicket,
  AveniaTicketStatus,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  createMoonbeamToPendulumXCM,
  createNablaTransactionsForOfframp,
  createOfframpSquidrouterTransactions,
  createPendulumToMoonbeamTransfer,
  decodeSubmittableExtrinsic,
  EvmToken,
  EvmTokenDetails,
  encodePayload,
  getEvmTokenBalance,
  getOnChainTokenDetails,
  getStatusAxelarScan,
  getTokenOutAmount,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
  multiplyByPowerOfTen,
  Networks,
  OnchainSwapQuoteParams,
  PendulumTokenDetails,
  signAndSubmitXcm,
  submitMoonbeamXcm,
  waitUntilTrue
} from "@packages/shared";
import splitReceiverABI from "@packages/shared/src/contracts/moonbeam/splitReceiverABI.json";
import { signExtrinsic, submitExtrinsic } from "@pendulum-chain/api-solang";
import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import Big from "big.js";
import { encodeFunctionData } from "viem";
import { polygon } from "viem/chains";
import { brlaFiatTokenDetails, brlaMoonbeamTokenDetails, usdcTokenDetails } from "../../constants.ts";
import { getConfig, getMoonbeamEvmClients, getPendulumAccount } from "../../utils/config.ts";
import { waitForTransactionConfirmation } from "../../utils/transactions.ts";

async function checkTicketStatusPaid(brlaApiService: BrlaApiService, ticketId: string): Promise<AveniaSwapTicket> {
  const pollInterval = 5000; // 5 seconds
  const timeout = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  let lastError: any;

  while (Date.now() - startTime < timeout) {
    try {
      const ticket = await brlaApiService.getAveniaSwapTicket(ticketId);
      if (ticket && ticket.status) {
        // TODO we log here, because for onchain swap PAID may not be the right final status
        console.log(`Ticket ${ticketId} status: ${ticket.status}`);
        if (ticket.status === AveniaTicketStatus.PAID) {
          return ticket;
        }
        if (ticket.status === AveniaTicketStatus.FAILED) {
          throw new Error("Ticket status is FAILED");
        }
      }
    } catch (error) {
      lastError = error;
      console.warn(`Polling for ticket ${ticketId} status failed with error. Retrying...`, lastError);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  if (lastError) {
    console.error("Polling for ticket status timed out with an error: ", lastError);
    throw new Error(`Polling for ticket status timed out with an error: ${lastError.message}`);
  }

  throw new Error("Polling for ticket status timed out.");
}

export async function checkInitialPendulumBalance(pendulumAddress: string, requiredAmount: string): Promise<Big> {
  const apiManager = ApiManager.getInstance();
  const pendulumNode = await apiManager.getApi("pendulum");
  // @ts-ignore
  const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumAddress, usdcTokenDetails.currencyId);

  // @ts-ignore
  const currentBalance = multiplyByPowerOfTen(Big(balanceResponse?.free?.toString() ?? "0"), -usdcTokenDetails.decimals);
  console.log(`Current axl.USDC balance on Pendulum: ${currentBalance.toFixed(4, 0)} USDC.axl.`);
  if (currentBalance.lt(requiredAmount)) {
    throw new Error(`Not enough USDC.axl on Pendulum account. Current balance: ${currentBalance.toFixed(4, 0)} USDC.axl.`);
  }

  return currentBalance;
}

export async function swapAxlusdcToBrla(amount: string): Promise<Big> {
  console.log(`Swapping ${amount} USDC.axl to BRLA...`);

  const apiManager = await ApiManager.getInstance();
  const { api } = await apiManager.getApi("pendulum");

  const expectedAmountOut = await getTokenOutAmount({
    api,
    fromAmountString: amount,
    inputTokenPendulumDetails: usdcTokenDetails,
    outputTokenPendulumDetails: brlaFiatTokenDetails.pendulumRepresentative
  });

  if (!expectedAmountOut.preciseQuotedAmountOut) {
    throw new Error("Failed to get expected amount out for the swap.");
  }

  console.log(
    `Expected amount out for ${amount} USDC.axl: ${expectedAmountOut.preciseQuotedAmountOut.preciseBigDecimal.toFixed(4, 0)} BRLA.`
  );

  const pendulumAccount = getPendulumAccount();
  const callerAddress = pendulumAccount.address;

  const amountRaw = multiplyByPowerOfTen(amount, usdcTokenDetails.decimals).toFixed(0, 0);
  const minOutputRaw = expectedAmountOut.preciseQuotedAmountOut.rawBalance.times(0.95).toFixed(0, 0); // 5% slippage tolerance

  const { approve, swap } = await createNablaTransactionsForOfframp(
    amountRaw,
    { address: callerAddress, network: Networks.Pendulum },
    usdcTokenDetails,
    brlaFiatTokenDetails.pendulumRepresentative,
    minOutputRaw
  );

  console.log("Approving USDC.axl for swap...");
  const approvalExtrinsic = decodeSubmittableExtrinsic(approve.transaction, api);
  await signExtrinsic(approvalExtrinsic, { keypair: pendulumAccount, type: "keypair" });
  const approvalResult = await submitExtrinsic(approvalExtrinsic);
  if (approvalResult.status.type === "error") {
    throw new Error("Failed to approve USDC.axl for swap.");
  }
  console.log("USDC.axl approved for swap.");

  console.log("Swapping USDC.axl to BRLA...");
  const swapExtrinsic = decodeSubmittableExtrinsic(swap.transaction, api);
  await signExtrinsic(swapExtrinsic, { keypair: pendulumAccount, type: "keypair" });
  const swapResult = await submitExtrinsic(swapExtrinsic);
  if (swapResult.status.type === "error") {
    throw new Error("Failed to swap USDC.axl to BRLA.");
  }
  console.log("USDC.axl swapped to BRLA successfully.");

  return expectedAmountOut.preciseQuotedAmountOut.preciseBigDecimal;
}

export async function sendBrlaToMoonbeam(brlaAmount: Big, brlaTokenDetails: PendulumTokenDetails): Promise<string> {
  console.log(`Sending ${brlaAmount.toFixed(4, 0)} BRLA to Moonbeam via XCM...`);

  const config = getConfig();
  const brlaAmountRaw = multiplyByPowerOfTen(brlaAmount, brlaTokenDetails.decimals).toFixed(0, 0);

  const xcmTransfer = await createPendulumToMoonbeamTransfer(
    config.brlaBusinessAccountAddress,
    brlaAmountRaw,
    brlaTokenDetails.currencyId
  );

  const pendulumAccount = getPendulumAccount();
  const result = await signAndSubmitXcm(pendulumAccount, xcmTransfer);
  return result.hash;
}

export async function waitForBrlaOnPolygon(brlaAmount: Big, brlaAmountRaw: string): Promise<void> {
  const { brlaBusinessAccountAddress } = getConfig();
  console.log(
    `Waiting for ${brlaAmount.toFixed(4, 0)} BRLA to be teleported to Polygon account ${brlaBusinessAccountAddress}...`
  );
  await checkEvmBalancePeriodically(
    brlaMoonbeamTokenDetails.polygonErc20Address,
    brlaBusinessAccountAddress,
    brlaAmountRaw,
    1_000, // 1 second
    5 * 60 * 1_000, // 5 minutes
    Networks.Polygon
  );
  console.log(`${brlaAmount.toFixed(4, 0)} BRLA successfully teleported to Polygon account.`);
}

// export async function transferUsdcToMoonbeamWithSquidrouter(usdcAmountRaw: string, pendulumAddress: string) {
//   console.log(`Transferring ${usdcAmountRaw} USDC to Moonbeam via SquidRouter...`);

//   const { walletClient: polygonWalletClient, publicClient: polygonPublicClient } = getPolygonEvmClients();

//   const usdcTokenDetails = getOnChainTokenDetails(Networks.Polygon, EvmToken.USDCE) as EvmTokenDetails;

//   const { approveData, swapData, squidRouterReceiverId, route } = await createOfframpSquidrouterTransactions({
//     fromAddress: polygonWalletClient.account.address,
//     fromNetwork: Networks.Polygon,
//     inputTokenDetails: usdcTokenDetails,
//     pendulumAddressDestination: pendulumAddress,
//     rawAmount: usdcAmountRaw
//   });

//   const approveDataExtended = {
//     account: polygonWalletClient.account,
//     chain: polygon,
//     data: approveData.data,
//     gas: BigInt(approveData.gas),
//     maxFeePerGas: approveData.maxFeePerGas ? BigInt(approveData.maxFeePerGas) * 5n : BigInt(187500000000),
//     maxPriorityFeePerGas: approveData.maxPriorityFeePerGas
//       ? BigInt(approveData.maxPriorityFeePerGas) * 5n
//       : BigInt(187500000000),
//     to: approveData.to,
//     value: BigInt(approveData.value)
//   };

//   console.log("Approving BRLA for swap on Polygon...");
//   const approveHash = await polygonWalletClient.sendTransaction(approveDataExtended);
//   console.log(`BRLA approval for swap on Polygon sent with transaction hash: ${approveHash}. Waiting for confirmation...`);
//   await waitForTransactionConfirmation(approveHash, polygonPublicClient);
//   console.log("BRLA approved for swap on Polygon. Transaction hash:", approveHash);

//   const swapDataExtended = {
//     account: polygonWalletClient.account,
//     chain: polygon,
//     data: swapData.data,
//     gas: BigInt(swapData.gas),
//     maxFeePerGas: swapData.maxFeePerGas ? BigInt(swapData.maxFeePerGas) * 5n : BigInt(187500000000),
//     maxPriorityFeePerGas: swapData.maxPriorityFeePerGas ? BigInt(swapData.maxPriorityFeePerGas) * 5n : BigInt(187500000000),
//     to: swapData.to,
//     value: BigInt(swapData.value)
//   };

//   console.log("Swapping BRLA to USDC.axl on Moonbeam via Squidrouter...");
//   const swapHash = await polygonWalletClient.sendTransaction(swapDataExtended);
//   console.log(`BRLA swap to USDC.axl on Moonbeam sent with transaction hash: ${swapHash}. Waiting for confirmation...`);
//   await waitForTransactionConfirmation(swapHash, polygonPublicClient);
//   console.log("BRLA swapped to USDC.axl on Moonbeam via Squidrouter. Transaction hash:", swapHash);

//   // Wait until the swap is executed on Axelar
//   let isExecuted = false;
//   while (!isExecuted) {
//     const axelarScanStatus = await getStatusAxelarScan(swapHash);

//     if (!axelarScanStatus) {
//       console.log(`No Axelar status found for swap hash ${swapHash}.`);
//       await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds before checking again
//       continue;
//     }
//     if (axelarScanStatus.status === "executed" || axelarScanStatus.status === "express_executed") {
//       isExecuted = true;
//       console.log(`Transaction ${swapHash} successfully executed on Axelar.`);
//       break;
//     }
//   }

//   return { amountUsd: route.estimate.toAmountUSD, squidRouterReceiverId };
// }

/// Swaps BRLA to USDC on BRLA API service and transfer them to the receiver address.
export async function swapBrlaToUsdcOnBrlaApiService(brlaAmount: Big, receiverAddress: `0x${string}`) {
  const aveniaOnchainSwapParams: OnchainSwapQuoteParams = {
    inputAmount: brlaAmount.toFixed(12, 0),
    inputCurrency: BrlaCurrency.BRLA,
    outputCurrency: BrlaCurrency.USDC
  };

  const brlaApiService = BrlaApiService.getInstance();
  const quote = await brlaApiService.createOnchainSwapQuote(aveniaOnchainSwapParams);
  console.log(`Created quote for swapping ${brlaAmount.toFixed(4, 0)} BRLA to USDC.axl:`, quote);

  const ticket = await brlaApiService.createOnchainSwapTicket({
    quoteToken: quote.quoteToken,
    ticketBlockchainOutput: {
      walletAddress: receiverAddress,
      walletChain: AveniaPaymentMethod.MOONBEAM
    }
  });
  console.log(`Created on-chain swap ticket with ID: ${ticket.id}`);

  // Wait a couple seconds for the swap to be processed on BRLA API service
  await new Promise(resolve => setTimeout(resolve, 10_000));

  // Check ticket status
  const paidTicket = await checkTicketStatusPaid(brlaApiService, ticket.id);

  return { amountUsd: quote.outputAmount, fee: "0", quoteToken: quote.quoteToken, rate: "1.0", ticketId: ticket.id };
}

export async function triggerXcmFromMoonbeam(
  rawAmount: string,
  pendulumAddress: string,
  tokenMoonbeamAddress: string
): Promise<void> {
  const { walletClient: moonbeamWalletClient, publicClient: moonbeamPublicClient } = getMoonbeamEvmClients();
  const { maxFeePerGas, maxPriorityFeePerGas } = await moonbeamPublicClient.estimateFeesPerGas();

  const apiManager = ApiManager.getInstance();
  const moonbeamNode = await apiManager.getApi("moonbeam");

  const xcmTransaction = await createMoonbeamToPendulumXCM(pendulumAddress, rawAmount, tokenMoonbeamAddress);
  console.log("xcm Transaction", xcmTransaction);
  const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;
  const keyring = new Keyring({ type: "ethereum" });
  const keypair = keyring.addFromUri(`${getConfig().moonbeamAccountSecret}/${ethDerPath}`);

  const accountNonce = await moonbeamNode.api.rpc.system.accountNextIndex(keypair.address);

  const signedXcmTransaction = await xcmTransaction.signAsync(keypair, { era: 0, nonce: accountNonce });

  const xcmHash = await submitMoonbeamXcm(keypair.address, signedXcmTransaction);

  // console.log(`USDC.axl sent to Pendulum via Receiver contract with transaction hash: ${xcmHash}. Waiting for confirmation...`);
  // await waitForTransactionConfirmation(xcmHash, moonbeamPublicClient);
  // console.log("USDC.axl successfully sent to Pendulum via Receiver contract. Transaction hash:", xcmHash);
}

export async function waitForAxlUsdcOnPendulum(
  expectedAmountToReceive: Big,
  pendulumAddress: string,
  initialBalance: Big
): Promise<void> {
  const apiManager = ApiManager.getInstance();
  const pendulumNode = await apiManager.getApi("pendulum");

  const didInputTokenArriveOnPendulum = async () => {
    // @ts-ignore
    const balanceResponse = await pendulumNode.api.query.tokens.accounts(pendulumAddress, usdcTokenDetails.currencyId);

    // @ts-ignore
    const newBalance = multiplyByPowerOfTen(Big(balanceResponse?.free?.toString() ?? "0"), -usdcTokenDetails.decimals);

    // Check that newBalance is again almost equal to the old current balance but with some small difference due to fees
    const tolerance = 0.05; // 5% tolerance
    const lowerBound = initialBalance.add(expectedAmountToReceive.times(1 - tolerance));
    const upperBound = initialBalance.add(expectedAmountToReceive.times(1 + tolerance));
    return newBalance.gte(lowerBound) && newBalance.lte(upperBound);
  };

  console.log(`Waiting for USDC to arrive on Pendulum account ${pendulumAddress}...`);
  await waitUntilTrue(didInputTokenArriveOnPendulum, 5000);
  console.log("USDC successfully arrived on Pendulum account.");
}

export const pollForSufficientBalance = async (brlaAmountBig: Big) => {
  const pollInterval = 5000; // 5 seconds
  const timeout = 5 * 60 * 1000; // 5 minutes
  const startTime = Date.now();
  let lastError: any;
  const brlaAmountUnits = brlaAmountBig.toFixed(0, 0);
  const brlaApiService = BrlaApiService.getInstance();

  while (Date.now() - startTime < timeout) {
    try {
      const balanceResponse = await brlaApiService.getMainAccountBalance();
      if (balanceResponse && balanceResponse.balances && balanceResponse.balances.BRLA !== undefined) {
        if (new Big(balanceResponse.balances.BRLA).gte(brlaAmountUnits)) {
          console.log(`Sufficient BRLA balance found: ${balanceResponse.balances.BRLA}`);
          return balanceResponse;
        }
        console.log(
          `Insufficient BRLA balance. Needed units: ${
            brlaAmountUnits
          }, have (in units): ${new Big(balanceResponse.balances.BRLA).toString()}. Retrying in 5s...`
        );
      }
    } catch (error) {
      lastError = error;
      console.log(`Polling for balance failed with error. Retrying...`, lastError);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  if (lastError) {
    console.log("BrlaPayoutOnMoonbeamPhaseHandler: Polling for balance failed: ", lastError);
    throw lastError;
  }
  throw new Error(
    `BrlaPayoutOnMoonbeamPhaseHandler: Balance check timed out after 5 minutes. Needed ${brlaAmountUnits} units.`
  );
};
