import {
  AveniaPaymentMethod,
  BalanceCheckError,
  BalanceCheckErrorType,
  BlockchainSendMethod,
  BrlaApiService,
  BrlaCurrency,
  checkEvmBalancePeriodically,
  EvmAddress,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getAnyFiatTokenDetailsMoonbeam,
  getEvmTokenBalance,
  multiplyByPowerOfTen,
  Networks,
  RampPhase,
  waitUntilTrueWithTimeout
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import RampState from "../../../../../models/rampState.model";
import TaxId from "../../../../../models/taxId.model";
import { APIError } from "../../../../errors/api-error";
import { BasePhaseHandler } from "../../../phases/base-phase-handler";
import { StateMetadata } from "../../../phases/meta-state-types";
import { evmIO } from "../core/io";
import type { Phase, PhaseIO } from "../core/types";

const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVM_BALANCE_CHECK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// The pre-computed expected amount stored at quote-creation time can be slightly higher than the
// amount actually transferred due to fee differences at execution time. We allow a 5% tolerance
// in the recovery shortcut so that an already-funded ephemeral is not missed.
const EPHEMERAL_FUNDED_TOLERANCE_FACTOR = 0.95;

class BrlaOnrampMintExecutor extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return "brlaOnrampMint";
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const { evmEphemeralAddress } = state.state as StateMetadata;

    if (!evmEphemeralAddress) {
      throw new Error("BrlaOnrampMintExecutor: State metadata corrupted. This is a bug.");
    }

    const quote = await QuoteTicket.findByPk(state.quoteId);
    if (!quote) {
      throw new Error("Quote not found for the given state");
    }

    if (!quote.metadata.aveniaMint) {
      throw new Error("Missing 'aveniaMint' in quote metadata");
    }

    if (!quote.metadata.aveniaTransfer) {
      throw new Error("Missing 'aveniaTransfer' in quote metadata");
    }

    const taxIdRecord = await TaxId.findByPk(state.state.taxId);
    if (!taxIdRecord) {
      throw new APIError({
        message: "Subaccount not found",
        status: httpStatus.BAD_REQUEST
      });
    }

    const tokenDetails = evmTokenConfig[Networks.Base][EvmToken.BRLA];
    if (!tokenDetails) {
      throw new Error("BRLA token details not found for Base network");
    }

    const preComputedExpectedAmountRaw = quote.metadata.aveniaTransfer.outputAmountRaw;

    // Recovery shortcut: a previous run may have already minted on Avenia and transferred to the
    // ephemeral. Accept a balance of at least 95% of the pre-computed expected amount.
    const recoveryThresholdRaw = new Big(preComputedExpectedAmountRaw).times(EPHEMERAL_FUNDED_TOLERANCE_FACTOR).toFixed(0, 0);

    if (await this.ephemeralAlreadyFunded(tokenDetails.erc20AddressSourceChain, evmEphemeralAddress, recoveryThresholdRaw)) {
      logger.info(
        `BrlaOnrampMintExecutor: Ephemeral ${evmEphemeralAddress} already holds at least 95% of the expected ${preComputedExpectedAmountRaw} BRLA (threshold: ${recoveryThresholdRaw}). Skipping mint flow.`
      );
      return state;
    }

    const brlaApiService = BrlaApiService.getInstance();
    try {
      logger.info(
        `BrlaOnrampMintExecutor: Waiting for Avenia balance to have at least ${quote.metadata.aveniaMint.outputAmountDecimal} BRL`
      );
      await waitUntilTrueWithTimeout(
        async () => {
          if (!quote.metadata.aveniaMint) {
            return false;
          }

          const { balances } = await brlaApiService.getAccountBalance(taxIdRecord.subAccountId);
          if (!balances || balances.BRLA === undefined || balances.BRLA === null) {
            return false;
          }
          return Number(balances.BRLA) >= Number(Big(quote.metadata.aveniaMint.outputAmountDecimal).toFixed(2, 0));
        },
        5000,
        PAYMENT_TIMEOUT_MS
      );
    } catch (error) {
      const isCheckTimeout = error instanceof Error && error.message.includes("Timeout");
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(
            `BrlaOnrampMintExecutor: phase timeout reached waiting for Avenia balance with error: ${error}`
          )
        : new Error(`Error checking Avenia balance: ${error}`);
    }

    // Transfer the funds from the subaccount to the ephemeral address
    const aveniaQuote = await brlaApiService.createPayInQuote({
      blockchainSendMethod: BlockchainSendMethod.PERMIT,
      inputAmount: Big(quote.metadata.aveniaMint.outputAmountDecimal).toFixed(2, 0),
      inputCurrency: BrlaCurrency.BRLA,
      inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.BASE,
      outputThirdParty: false,
      subAccountId: taxIdRecord.subAccountId
    });

    logger.info("BrlaOnrampMintExecutor: Created Avenia pay-out quote for mint transfer.");

    // Derive the expected on-chain amount from the live quote rather than the stale pre-computed
    // metadata value: the live quote accounts for the fees actually applied at execution time.
    const expectedAmountReceived = multiplyByPowerOfTen(new Big(aveniaQuote.outputAmount), tokenDetails.decimals).toFixed(0, 0);

    logger.info(
      `BrlaOnrampMintExecutor: Live Avenia quote output is ${aveniaQuote.outputAmount} BRLA (raw: ${expectedAmountReceived}). Pre-computed metadata value was ${preComputedExpectedAmountRaw}.`
    );

    const aveniaTicket = await brlaApiService.createPixOutputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          walletAddress: state.state.evmEphemeralAddress,
          walletChain: AveniaPaymentMethod.BASE
        }
      },
      taxIdRecord.subAccountId
    );

    logger.info(
      `BrlaOnrampMintExecutor: Created Avenia transfer ticket with id ${aveniaTicket.id} to transfer ${aveniaQuote.outputAmount} BRLA to Base address ${state.state.evmEphemeralAddress}`
    );

    try {
      const pollingTimeMs = 1000;

      await checkEvmBalancePeriodically(
        tokenDetails.erc20AddressSourceChain,
        evmEphemeralAddress,
        expectedAmountReceived,
        pollingTimeMs,
        EVM_BALANCE_CHECK_TIMEOUT_MS,
        Networks.Base
      );
    } catch (error) {
      if (!(error instanceof BalanceCheckError)) throw error;

      const isCheckTimeout = error.type === BalanceCheckErrorType.Timeout;
      if (isCheckTimeout && this.isPaymentTimeoutReached(state)) {
        logger.error("Payment timeout. Cancelling ramp.");
        return this.transitionToNextPhase(state, "failed");
      }

      throw isCheckTimeout
        ? this.createRecoverableError(`BrlaOnrampMintExecutor: phase timeout reached with error: ${error}`)
        : new Error(`Error checking Base balance: ${error}`);
    }

    return state;
  }

  private async ephemeralAlreadyFunded(
    tokenAddress: string,
    ownerAddress: string,
    expectedAmountRaw: string
  ): Promise<boolean> {
    try {
      const balance = await getEvmTokenBalance({
        chain: Networks.Base,
        ownerAddress: ownerAddress as EvmAddress,
        tokenAddress: tokenAddress as EvmAddress
      });
      return balance.gte(new Big(expectedAmountRaw));
    } catch (error) {
      // Treat read failures as "not funded" so we fall through to the regular flow rather than
      // aborting the phase on a transient RPC error.
      logger.warn(
        `BrlaOnrampMintExecutor: ephemeral balance pre-check failed for ${ownerAddress}, falling back to Avenia flow: ${error}`
      );
      return false;
    }
  }

  protected isPaymentTimeoutReached(state: RampState): boolean {
    const thisPhaseEntry = state.phaseHistory.find(phaseHistoryEntry => phaseHistoryEntry.phase === this.getPhaseName());
    if (!thisPhaseEntry) {
      throw new Error("BrlaOnrampMintExecutor: Phase not found in history. This is a bug.");
    }

    const initialTimestamp = new Date(thisPhaseEntry.timestamp);
    return initialTimestamp.getTime() + PAYMENT_TIMEOUT_MS < Date.now();
  }
}

export const AveniaMint: Phase<PhaseIO<typeof FiatToken.BRL, "fiat">, PhaseIO<typeof EvmToken.BRLA, typeof Networks.Base>> = {
  executors: [new BrlaOnrampMintExecutor()],
  name: "AveniaMint",
  phases: ["brlaOnrampMint"],
  async simulate(input, ctx) {
    const brlaTokenDetails = getAnyFiatTokenDetailsMoonbeam(FiatToken.BRL);
    const inputAmountDecimal = new Big(input.amount);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountDecimal, brlaTokenDetails.decimals).toFixed(0, 0);

    const brlaApiService = BrlaApiService.getInstance();
    const aveniaPayInToInternalQuote = await brlaApiService.createPayInQuote(
      {
        inputAmount: inputAmountDecimal.toString(),
        inputCurrency: BrlaCurrency.BRL,
        inputPaymentMethod: AveniaPaymentMethod.PIX,
        inputThirdParty: false,
        outputCurrency: BrlaCurrency.BRLA,
        outputPaymentMethod: AveniaPaymentMethod.INTERNAL,
        outputThirdParty: false
      },
      { useCache: true }
    );

    const aveniaTransferQuote = await brlaApiService.createPayInQuote(
      {
        blockchainSendMethod: BlockchainSendMethod.PERMIT,
        inputAmount: aveniaPayInToInternalQuote.outputAmount.toString(),
        inputCurrency: BrlaCurrency.BRLA,
        inputPaymentMethod: AveniaPaymentMethod.INTERNAL,
        inputThirdParty: false,
        outputCurrency: BrlaCurrency.BRLA,
        outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
        outputThirdParty: false
      },
      { useCache: true }
    );

    // We add a small buffer for the gas fees
    const gasFeePayIn = aveniaPayInToInternalQuote.appliedFees.find(fee => fee.type === "Gas Fee");
    const receivedBrlaDecimal = new Big(aveniaPayInToInternalQuote.outputAmount).minus(gasFeePayIn?.amount || 0);
    const receivedBrlaRaw = multiplyByPowerOfTen(receivedBrlaDecimal, brlaTokenDetails.decimals).toFixed(0, 0);

    const gasFeeTransfer = aveniaTransferQuote.appliedFees.find(fee => fee.type === "Gas Fee");
    let gasFeeBuffer = new Big(0.1); // Default to 0.1 BRL if we can't find the gas fee
    if (gasFeePayIn || gasFeeTransfer) {
      const gasFeeAmount = new Big(gasFeePayIn?.amount || 0).plus(gasFeeTransfer?.amount || 0);
      // We add a 50% buffer to the applied gas fee
      gasFeeBuffer = gasFeeAmount.mul(0.5);
    }

    const mintedBrlaDecimal = new Big(aveniaTransferQuote.outputAmount).minus(gasFeeBuffer);
    const mintedBrlaRaw = multiplyByPowerOfTen(mintedBrlaDecimal, brlaTokenDetails.decimals).toFixed(0, 0);
    const transferFee = receivedBrlaDecimal.minus(mintedBrlaDecimal);

    ctx.addNote(`AveniaMint: assuming ${mintedBrlaDecimal.toFixed()} BRLA minted on the Base ephemeral account`);

    return evmIO(EvmToken.BRLA, Networks.Base, mintedBrlaDecimal, mintedBrlaRaw, {
      ...input.meta,
      aveniaMint: {
        currency: FiatToken.BRL,
        fee: inputAmountDecimal.minus(aveniaPayInToInternalQuote.outputAmount),
        inputAmountDecimal,
        inputAmountRaw,
        outputAmountDecimal: receivedBrlaDecimal,
        outputAmountRaw: receivedBrlaRaw
      },
      aveniaTransfer: {
        currency: FiatToken.BRL,
        fee: transferFee,
        inputAmountDecimal: receivedBrlaDecimal,
        inputAmountRaw: receivedBrlaRaw,
        outputAmountDecimal: mintedBrlaDecimal,
        outputAmountRaw: mintedBrlaRaw
      },
      fees: ctx.fees
    });
  }
};
