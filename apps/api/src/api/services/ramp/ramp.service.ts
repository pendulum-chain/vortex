import { decodeAddress } from "@polkadot/util-crypto";
import {
  AccountMeta,
  ALFREDPAY_ONCHAIN_CURRENCY,
  AlfredpayApiService,
  AlfredpayChain,
  AlfredpayFiatCurrency,
  AlfredpayFiatPaymentInstructions,
  AlfredpayPaymentMethodType,
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  CreateAlfredpayOfframpQuoteRequest,
  CreateAlfredpayOnrampRequest,
  EphemeralAccountType,
  FiatToken,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  generateReferenceLabel,
  IbanPaymentData,
  isAlfredpayToken,
  Limit,
  MykoboApiService,
  MykoboCurrency,
  MykoboTransactionType,
  Networks,
  normalizeTaxId,
  QuoteError,
  RampDirection,
  RampErrorLog,
  RampPhase,
  RampProcess,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  TransactionStatus,
  UnsignedTx,
  UpdateRampRequest,
  UpdateRampResponse,
  validateMaskedNumber
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { Op, Transaction, WhereOptions } from "sequelize";
import { isAddress } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState, { RampStateAttributes } from "../../../models/rampState.model";
import User from "../../../models/user.model";
import { APIError } from "../../errors/api-error";
import {
  ActivePartner,
  handleQuoteConsumptionForDiscountState,
  resolveActivePartnerById
} from "../../services/quote/engines/discount/helpers";
import { findAveniaCustomerByTaxId } from "../avenia/avenia-customer.service";
import { resolveAveniaAccountForRamp } from "../avenia-account";
import { resolveMykoboCustomerForUser } from "../mykobo/mykobo-customer.service";
import { StateMetadata } from "../phases/meta-state-types";
import phaseProcessor from "../phases/phase-processor";
import { PriceFeedService } from "../priceFeed.service";
import { resolveAlfredpayCustomerId } from "../quote/alfredpay-customer";
import { prepareOfframpTransactions } from "../transactions/offramp";
import { prepareOnrampTransactions } from "../transactions/onramp";
import { AveniaOnrampTransactionParams } from "../transactions/onramp/common/types";
import { prepareMykoboToEvmOnrampTransactions } from "../transactions/onramp/routes/mykobo-to-evm";
import { validatePresignedTxs } from "../transactions/validation";
import webhookDeliveryService from "../webhook/webhook-delivery.service";
import { BaseRampService } from "./base.service";
import { validateEphemeralAccountsFresh } from "./ephemeral-freshness";
import { getFinalTransactionHashForRampV2 } from "./helpers";
import { RampTransactionPreparationKind, selectRampTransactionPreparationKind } from "./ramp-transaction-preparation";

const RAMP_START_EXPIRATION_TIME_SECONDS = 900; // 15 minutes

// Classifies unsigned txs by signer: ephemeral-signed (backend pre-signs) vs user-wallet-signed.
function partitionUnsignedTxs(
  unsignedTxs: UnsignedTx[],
  ephemerals: { evm?: string; substrate?: string }
): { ephemeralTxs: UnsignedTx[]; userWalletTxs: UnsignedTx[] } {
  const ephemeralSigners = new Set(
    [ephemerals.evm, ephemerals.substrate].filter((v): v is string => Boolean(v)).map(s => s.toLowerCase())
  );

  const ephemeralTxs: UnsignedTx[] = [];
  const userWalletTxs: UnsignedTx[] = [];
  for (const tx of unsignedTxs) {
    if (ephemeralSigners.has(tx.signer.toLowerCase())) {
      ephemeralTxs.push(tx);
    } else {
      userWalletTxs.push(tx);
    }
  }
  return { ephemeralTxs, userWalletTxs };
}

// For offramp, user-wallet txs are only released once all ephemeral presigned txs are received
// and validated. This prevents older SDK versions from kicking off the user's source-of-funds
// transfer when the backend has added new ephemeral txs that the SDK does not know how to sign.
function filterUnsignedTxsForResponse(rampState: RampState, ephemeralPresignChecksPass: boolean): UnsignedTx[] {
  if (rampState.type !== RampDirection.SELL) return rampState.unsignedTxs;
  if (ephemeralPresignChecksPass) return rampState.unsignedTxs;

  const { ephemeralTxs } = partitionUnsignedTxs(rampState.unsignedTxs, {
    evm: rampState.state.evmEphemeralAddress,
    substrate: rampState.state.substrateEphemeralAddress
  });
  return ephemeralTxs;
}

/**
 * Validates the address format for a given ephemeral account type.
 * Throws if the address is empty or does not match the expected format.
 */
function validateAddressFormat(address: string, type: EphemeralAccountType): void {
  if (!address || address.trim().length === 0) {
    throw new Error(`Empty address provided for ${type} ephemeral account.`);
  }

  switch (type) {
    case EphemeralAccountType.Substrate:
      try {
        decodeAddress(address);
      } catch {
        throw new Error(`Invalid Substrate address format: "${address}". Expected a valid SS58 address.`);
      }
      break;

    case EphemeralAccountType.EVM:
      if (!isAddress(address)) {
        throw new Error(`Invalid EVM address format: "${address}". Expected a valid Ethereum address.`);
      }
      break;
  }
}

export function normalizeAndValidateSigningAccounts(accounts: AccountMeta[]) {
  const normalizedSigningAccounts: AccountMeta[] = [];
  const ephemerals: { [key in EphemeralAccountType]?: string } = {};

  accounts.forEach(account => {
    const type = Object.values(EphemeralAccountType).find(type => type.toLowerCase() === account.type.toLowerCase());
    if (!type) {
      return;
    }

    validateAddressFormat(account.address, type);

    normalizedSigningAccounts.push({
      address: account.address,
      type: type
    });

    ephemerals[type] = account.address;
  });

  return { ephemerals, normalizedSigningAccounts };
}

export class RampService extends BaseRampService {
  // Two backends share one database; each must only touch ramps/quotes for its own flow.
  // We return 404 on mismatch so the wrong backend looks indistinguishable from "not found".
  private static assertOwnedByThisFlow(entity: { flowVariant: string; id: string }, kind: "Ramp" | "Quote"): void {
    if (entity.flowVariant !== config.flowVariant) {
      throw new APIError({
        message: `${kind} not found`,
        status: httpStatus.NOT_FOUND
      });
    }
  }
  /**
   * Register a new ramping process. This will create a new ramp state and create transactions that need to be signed
   * on the client side.
   */
  public async registerRamp(request: RegisterRampRequest, _route = "/v1/ramp/register"): Promise<RampProcess> {
    return this.withTransaction(async transaction => {
      const { signingAccounts, quoteId, additionalData } = request;

      const quote = await QuoteTicket.findByPk(quoteId, { lock: Transaction.LOCK.UPDATE, transaction });

      if (!quote) {
        throw new APIError({
          message: QuoteError.QuoteNotFound,
          status: httpStatus.NOT_FOUND
        });
      }

      RampService.assertOwnedByThisFlow(quote, "Quote");

      if (quote.status !== "pending") {
        throw new APIError({
          message: `Quote is ${quote.status}`,
          status: httpStatus.BAD_REQUEST
        });
      }

      if (new Date(quote.expiresAt) < new Date()) {
        await quote.destroy({ transaction });

        throw new APIError({
          message: "Quote has expired",
          status: httpStatus.BAD_REQUEST
        });
      }

      if (request.userId && quote.userId && request.userId !== quote.userId) {
        throw new APIError({
          message: "Authenticated user does not own this provider-bound quote.",
          status: httpStatus.FORBIDDEN
        });
      }

      // An anonymous quote (userId == null) carries no owner, so an authenticated caller
      // claiming it is not an escalation — this is the normal web-app funnel (quote before
      // login, register after). Provider identity is still derived from the effective user.
      const effectiveUserId = request.userId || quote.userId || undefined;

      if (!effectiveUserId) {
        throw new APIError({
          message: "Invalid quote: this route requires an API key linked to a user or Supabase user authentication.",
          status: httpStatus.BAD_REQUEST
        });
      }

      const user = await User.findByPk(effectiveUserId, { lock: Transaction.LOCK.UPDATE, transaction });
      if (!user) {
        throw new APIError({
          message: "Authenticated user profile not found.",
          status: httpStatus.BAD_REQUEST
        });
      }

      const startDeadline = new Date(Date.now() - RAMP_START_EXPIRATION_TIME_SECONDS * 1000);
      await RampState.update(
        { currentPhase: "timedOut" },
        {
          transaction,
          where: {
            createdAt: { [Op.lt]: startDeadline },
            currentPhase: "initial",
            userId: effectiveUserId
          }
        }
      );

      const activeRamp = await RampState.findOne({
        attributes: ["id"],
        transaction,
        where: {
          currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut"] },
          userId: effectiveUserId
        }
      });
      if (activeRamp) {
        throw new APIError({
          message: `An active ramp already exists for this user: ${activeRamp.id}`,
          status: httpStatus.CONFLICT
        });
      }

      // Before removing this kill-switch, add a hermetic EUR corridor scenario in
      // apps/api/src/tests/corridors/ (the Mykobo corridors are currently covered by
      // RUN_LIVE_TESTS-gated tests only — see docs/testing-strategy.md).
      if (quote.inputCurrency === FiatToken.EURC || quote.outputCurrency === FiatToken.EURC) {
        throw new APIError({
          message: "EUR ramps are currently disabled",
          status: httpStatus.SERVICE_UNAVAILABLE
        });
      }

      const { normalizedSigningAccounts, ephemerals } = normalizeAndValidateSigningAccounts(signingAccounts);

      await validateEphemeralAccountsFresh(ephemerals);

      const { unsignedTxs, stateMeta, depositQrCode, ibanPaymentData, aveniaTicketId } = await this.prepareRampTransactions(
        quote,
        normalizedSigningAccounts,
        additionalData,
        signingAccounts,
        transaction,
        effectiveUserId
      );

      const [affectedRows] = await this.consumeQuote(quote.id, transaction);
      if (affectedRows === 0) {
        throw new APIError({
          message: "Quote already consumed",
          status: httpStatus.CONFLICT
        });
      }

      const pricingPartnerId = quote.pricingPartnerId ?? quote.partnerId;
      let partner: ActivePartner = null;
      if (pricingPartnerId) {
        partner = await resolveActivePartnerById(pricingPartnerId, quote.rampType);
      }

      handleQuoteConsumptionForDiscountState(partner);

      // Create initial ramp state
      const rampState = await this.createRampState(
        {
          currentPhase: "initial" as RampPhase,
          flowVariant: quote.flowVariant,
          from: quote.from,
          paymentMethod: quote.paymentMethod,
          postCompleteState: {
            cleanup: { cleanupAt: null, cleanupCompleted: false, errors: null }
          },
          presignedTxs: null,
          processingLock: { locked: false, lockedAt: null },
          quoteId: quote.id,
          state: {
            aveniaTicketId,
            depositQrCode,
            evmEphemeralAddress: ephemerals.EVM,
            ibanPaymentData,
            substrateEphemeralAddress: ephemerals.Substrate,
            ...request.additionalData,
            ...stateMeta
          } as StateMetadata,
          to: quote.to,
          type: quote.rampType,
          unsignedTxs,
          userId: effectiveUserId
        },
        transaction
      );

      const response: RegisterRampResponse = {
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        // depositQrCode and ibanPaymentData  are released by updateRamp once all presigned transactions validate.
        expiresAt: new Date(rampState.createdAt.getTime() + RAMP_START_EXPIRATION_TIME_SECONDS * 1000).toISOString(),
        from: rampState.from,
        id: rampState.id,
        inputAmount: quote.inputAmount,
        inputCurrency: quote.inputCurrency,
        outputAmount: quote.outputAmount,
        outputCurrency: quote.outputCurrency,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        sessionId: rampState.state.sessionId,
        status: this.mapPhaseToStatus(rampState.currentPhase),
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: filterUnsignedTxsForResponse(rampState, false),
        updatedAt: rampState.updatedAt.toISOString(),
        walletAddress: rampState.state.destinationAddress || rampState.state.walletAddress
      };

      return response;
    });
  }

  /**
   * Update a ramping process with presigned transactions and additional data
   */
  public async updateRamp(request: UpdateRampRequest): Promise<UpdateRampResponse> {
    return this.withTransaction(async transaction => {
      const { rampId, presignedTxs, additionalData } = request;

      const rampState = await RampState.findByPk(rampId, { transaction });
      if (!rampState) {
        throw new APIError({
          message: "Ramp not found",
          status: httpStatus.NOT_FOUND
        });
      }

      RampService.assertOwnedByThisFlow(rampState, "Ramp");

      const quote = await QuoteTicket.findByPk(rampState.quoteId, { transaction });

      if (!quote) {
        throw new APIError({
          message: QuoteError.QuoteNotFound,
          status: httpStatus.NOT_FOUND
        });
      }

      // Check if the ramp is in a state that allows updates
      if (rampState.currentPhase !== "initial") {
        throw new APIError({
          message: "Ramp is not in a state that allows updates",
          status: httpStatus.CONFLICT
        });
      }

      // Validate presigned transactions, if some were supplied
      const ephemerals: { [key in EphemeralAccountType]: string } = {
        EVM: rampState.state.evmEphemeralAddress,
        Substrate: rampState.state.substrateEphemeralAddress
      };
      if (presignedTxs && presignedTxs.length > 0) {
        // updateRamp accepts partial submissions; the strict completeness check runs later in
        // ephemeralPresignChecksPass against the full merged set, which gates payment-data
        // release in filterUnsignedTxsForResponse.
        await validatePresignedTxs(rampState.type, presignedTxs, ephemerals, rampState.unsignedTxs, { requireComplete: false });
      }

      // Merge presigned transactions (replace existing ones with same phase/network/signer)
      const existingTxs = rampState.presignedTxs || [];
      const updatedTxs = [...existingTxs];

      presignedTxs.forEach((newTx: UnsignedTx) => {
        const existingIndex = updatedTxs.findIndex(
          tx => tx.phase === newTx.phase && tx.network === newTx.network && tx.signer === newTx.signer
        );
        if (existingIndex >= 0) {
          updatedTxs[existingIndex] = newTx;
        } else {
          updatedTxs.push(newTx);
        }
      });

      // Merge additional data
      const existingAdditionalData = rampState.state || {};
      const mergedAdditionalData = { ...existingAdditionalData, ...additionalData };

      // Update the ramp state
      await rampState.update(
        {
          presignedTxs: updatedTxs,
          state: mergedAdditionalData
        },
        { transaction }
      );

      const presignChecksPass = await this.tryReleaseDepositQr(rampState, quote, transaction);
      const ephemeralPresignChecksPass = presignChecksPass || (await this.ephemeralPresignChecksPass(rampState));

      let achPaymentData: AlfredpayFiatPaymentInstructions | undefined = undefined;
      if (isAlfredpayToken(quote.inputCurrency as FiatToken)) {
        achPaymentData = await this.processAlfredpayOnrampStart(rampState, quote, transaction);
      }

      if (isAlfredpayToken(quote.outputCurrency as FiatToken)) {
        await this.processAlfredpayOfframpStart(rampState, quote, transaction);
      }

      // Create response
      const response: UpdateRampResponse = {
        achPaymentData,
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        depositQrCode: presignChecksPass ? rampState.state.depositQrCode : undefined,
        expiresAt: new Date(rampState.createdAt.getTime() + RAMP_START_EXPIRATION_TIME_SECONDS * 1000).toISOString(),
        from: rampState.from,
        ibanPaymentData: presignChecksPass ? rampState.state.ibanPaymentData : undefined,
        id: rampState.id,
        inputAmount: quote.inputAmount,
        inputCurrency: quote.inputCurrency,
        outputAmount: quote.outputAmount,
        outputCurrency: quote.outputCurrency,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        sessionId: rampState.state.sessionId,
        status: this.mapPhaseToStatus(rampState.currentPhase),
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: filterUnsignedTxsForResponse(rampState, ephemeralPresignChecksPass),
        // Use current time since we just updated
        updatedAt: new Date().toISOString(),
        walletAddress: rampState.state.destinationAddress || rampState.state.walletAddress
      };

      return response;
    });
  }

  /**
   * Start a new ramping process. This will kick off the ramping process with the presigned transactions provided.
   */
  public async startRamp(request: StartRampRequest): Promise<StartRampResponse> {
    return this.withTransaction(async transaction => {
      const rampState = await RampState.findByPk(request.rampId, {
        transaction
      });

      if (!rampState) {
        throw new APIError({
          message: "Ramp not found",
          status: httpStatus.NOT_FOUND
        });
      }

      RampService.assertOwnedByThisFlow(rampState, "Ramp");

      const quote = await QuoteTicket.findByPk(rampState.quoteId, { transaction });

      if (!quote) {
        throw new APIError({
          message: QuoteError.QuoteNotFound,
          status: httpStatus.NOT_FOUND
        });
      }

      this.validateRampStateData(rampState, quote);

      const rampStateCreationTime = new Date(rampState.createdAt);
      const currentTime = new Date();
      const timeDifferenceSeconds = (currentTime.getTime() - rampStateCreationTime.getTime()) / 1000;

      if (timeDifferenceSeconds > RAMP_START_EXPIRATION_TIME_SECONDS) {
        await this.cancelRamp(rampState.id);
        throw new APIError({
          message: "Maximum time window to start process exceeded. Ramp invalidated.",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Check if presigned transactions are available (should be set by updateRamp)
      if (!rampState.presignedTxs || rampState.presignedTxs.length === 0) {
        throw new APIError({
          message: "No presigned transactions found. Please call updateRamp first.",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Validate presigned transactions
      const ephemerals: { [key in EphemeralAccountType]: string } = {
        EVM: rampState.state.evmEphemeralAddress,
        Substrate: rampState.state.substrateEphemeralAddress
      };
      await validatePresignedTxs(rampState.type, rampState.presignedTxs, ephemerals, rampState.unsignedTxs);

      logger.log("Triggering TRANSACTION_CREATED webhook for ramp state:", rampState.id);
      webhookDeliveryService
        .triggerTransactionCreated(
          rampState.quoteId,
          (rampState.state?.sessionId as string) || null,
          rampState.id,
          quote.rampType
        )
        .catch(error => {
          logger.error(`Error triggering TRANSACTION_CREATED webhook for ${rampState.id}:`, error);
        });

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch(error => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });

      // Create response
      const response: StartRampResponse = {
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        depositQrCode: rampState.state.depositQrCode,
        from: rampState.from,
        ibanPaymentData: rampState.state.ibanPaymentData,
        id: rampState.id,
        inputAmount: quote.inputAmount,
        inputCurrency: quote.inputCurrency,
        outputAmount: quote.outputAmount,
        outputCurrency: quote.outputCurrency,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        sessionId: rampState.state.sessionId,
        status: this.mapPhaseToStatus(rampState.currentPhase),
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: rampState.unsignedTxs,
        updatedAt: rampState.updatedAt.toISOString(),
        walletAddress: rampState.state.destinationAddress || rampState.state.walletAddress
      };

      return response;
    });
  }

  /**
   * Get the status of a ramping process
   */
  public async getRampStatus(id: string, showUnsignedTxs = false): Promise<GetRampStatusResponse | null> {
    const rampState = await this.getRampState(id);

    if (!rampState) {
      return null;
    }

    if (rampState.flowVariant !== config.flowVariant) {
      return null;
    }

    // Fetch associated quote for fee data
    const quote = await QuoteTicket.findByPk(rampState.quoteId);

    if (!quote) {
      throw new APIError({
        message: "Associated quote not found",
        status: httpStatus.NOT_FOUND
      });
    }

    const usdFees = quote.metadata.fees?.usd;
    const fiatFees = quote.metadata.fees?.displayFiat;
    if (!usdFees || !fiatFees) {
      throw new APIError({
        message: "Quote fee structure is incomplete",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // Calculate processing fees
    const processingFeeFiat = new Big(fiatFees.anchor).plus(fiatFees.vortex).toFixed();
    const processingFeeUsd = new Big(usdFees.anchor).plus(usdFees.vortex).toFixed();

    const isOnHoldForComplianceCheck = rampState.currentPhase === "brlaOnrampMint" && rampState.state.onHold;

    // Never return 'failed' as current phase, instead return last known phase
    const currentPhase: RampPhase = isOnHoldForComplianceCheck
      ? "onHoldForComplianceCheck"
      : rampState.currentPhase !== "failed"
        ? rampState.currentPhase
        : // Find second-last entry in phase history or show 'initial' if not available
          rampState.phaseHistory && rampState.phaseHistory.length > 1
          ? rampState.phaseHistory[rampState.phaseHistory.length - 2].phase
          : "initial";

    // Get or compute the V2 final transaction hash and explorer link. The legacy field intentionally used the
    // second-last network for older clients, so status/history responses ignore it here.
    let transactionHash = rampState.state.finalTransactionHashV2;
    let transactionExplorerLink = rampState.state.finalTransactionExplorerLinkV2;

    // If not stored yet and ramp is complete, compute and store them
    if (rampState.currentPhase === "complete" && (!transactionHash || !transactionExplorerLink)) {
      const result = getFinalTransactionHashForRampV2(rampState, quote);
      transactionHash = result.transactionHash;
      transactionExplorerLink = result.transactionExplorerLink;

      // Store the computed values in the state for future use
      if (transactionHash && transactionExplorerLink) {
        await rampState.update({
          state: {
            ...rampState.state,
            finalTransactionExplorerLinkV2: transactionExplorerLink,
            finalTransactionHashV2: transactionHash
          }
        });
      }
    }

    const response: GetRampStatusResponse = {
      achPaymentData: rampState.state.fiatPaymentInstructions,
      anchorFeeFiat: fiatFees.anchor,
      anchorFeeUsd: usdFees.anchor,
      countryCode: quote.countryCode || undefined,
      createdAt: rampState.createdAt.toISOString(),
      currentPhase,
      depositQrCode: rampState.state.presignChecksPass ? rampState.state.depositQrCode : undefined,
      feeCurrency: fiatFees.currency,
      from: rampState.from,
      ibanPaymentData: rampState.state.presignChecksPass ? rampState.state.ibanPaymentData : undefined,
      id: rampState.id,
      inputAmount: quote.inputAmount,
      inputCurrency: quote.inputCurrency,
      network: quote.network,
      networkFeeFiat: fiatFees.network,
      networkFeeUsd: usdFees.network,
      outputAmount: quote.outputAmount,
      outputCurrency: quote.outputCurrency,
      partnerFeeFiat: fiatFees.partnerMarkup,
      partnerFeeUsd: usdFees.partnerMarkup,
      paymentMethod: rampState.paymentMethod,
      processingFeeFiat,
      processingFeeUsd,
      quoteId: rampState.quoteId,
      sessionId: rampState.state.sessionId,
      status: this.mapPhaseToStatus(rampState.currentPhase),
      ...(quote.metadata.subsidyDisplay
        ? {
            discountCurrency: quote.metadata.subsidyDisplay.currency,
            discountFiat: quote.metadata.subsidyDisplay.fiat,
            discountUsd: quote.metadata.subsidyDisplay.usd
          }
        : {}),
      to: rampState.to,
      totalFeeFiat: fiatFees.total,
      totalFeeUsd: usdFees.total,
      transactionExplorerLink,
      transactionHash,
      type: rampState.type,
      updatedAt: rampState.updatedAt.toISOString(),
      vortexFeeFiat: fiatFees.vortex,
      vortexFeeUsd: usdFees.vortex,
      walletAddress: rampState.state.destinationAddress || rampState.state.walletAddress,
      ...(showUnsignedTxs && { unsignedTxs: rampState.unsignedTxs })
    };

    return response;
  }

  /**
   * Get the error logs for a ramping process
   */
  public async getErrorLogs(id: string): Promise<RampErrorLog[] | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    if (rampState.flowVariant !== config.flowVariant) {
      return null;
    }

    return rampState.errorLogs;
  }

  /**
   * Get ramp history for a wallet address
   */
  public async getRampHistory(
    walletAddress: string,
    owner: { partnerId: string } | { userId: string },
    limit?: number,
    offset?: number
  ): Promise<GetRampHistoryResponse> {
    const baseWhere = {
      [Op.or]: [{ "state.walletAddress": walletAddress }, { "state.destinationAddress": walletAddress }],
      currentPhase: {
        [Op.ne]: "initial"
      },
      flowVariant: config.flowVariant
    };

    let where: WhereOptions<RampStateAttributes>;
    if ("userId" in owner) {
      where = { ...baseWhere, userId: owner.userId };
    } else {
      const partnerQuotes = await QuoteTicket.findAll({
        attributes: ["id"],
        where: { partnerId: owner.partnerId }
      });
      const ownedQuoteIds = partnerQuotes.map(q => q.id);
      if (ownedQuoteIds.length === 0) {
        return { totalCount: 0, transactions: [] };
      }
      where = { ...baseWhere, quoteId: { [Op.in]: ownedQuoteIds } };
    }

    const { rows: rampStates, count: totalCount } = await RampState.findAndCountAll({
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      where
    });

    // Fetch quotes for the ramp states
    const quoteIds = rampStates.map(ramp => ramp.quoteId);
    const quotes = await QuoteTicket.findAll({
      where: { id: quoteIds }
    });
    const quoteMap = new Map(quotes.map(quote => [quote.id, quote]));

    const transactions = await Promise.all(
      rampStates.map(async ramp => {
        const quote = quoteMap.get(ramp.quoteId);

        if (!quote) {
          throw new APIError({
            message: `Associated quote not found for ramp ${ramp.id}`,
            status: httpStatus.NOT_FOUND
          });
        }

        // Get or compute the V2 final transaction hash and explorer link (similar to getRampStatus).
        // Do not fall back to the legacy finalTransactionExplorerLink because that may point to Squid/Axelar.
        let transactionHash = ramp.state.finalTransactionHashV2;
        let transactionExplorerLink = ramp.state.finalTransactionExplorerLinkV2;

        // If not stored yet and ramp is complete, compute and store them
        if (ramp.currentPhase === "complete" && (!transactionHash || !transactionExplorerLink)) {
          const result = getFinalTransactionHashForRampV2(ramp, quote);
          transactionHash = result.transactionHash;
          transactionExplorerLink = result.transactionExplorerLink;

          // Store the computed values in the state for future use
          if (transactionHash && transactionExplorerLink) {
            await ramp.update({
              state: {
                ...ramp.state,
                finalTransactionExplorerLinkV2: transactionExplorerLink,
                finalTransactionHashV2: transactionHash
              }
            });
          }
        }

        return {
          currentPhase: ramp.currentPhase,
          date: ramp.createdAt.toISOString(),
          externalTxExplorerLink: transactionExplorerLink,
          externalTxHash: transactionHash,
          from: ramp.from,
          fromAmount: quote.inputAmount,
          fromCurrency: quote.inputCurrency,
          id: ramp.id,
          status: this.mapPhaseToStatus(ramp.currentPhase),
          to: ramp.to,
          toAmount: quote.outputAmount,
          toCurrency: quote.outputCurrency,
          type: ramp.type
        };
      })
    );

    return { totalCount, transactions };
  }

  /**
   * Map ramp phase to a user-friendly status
   */
  private mapPhaseToStatus(phase: RampPhase): TransactionStatus {
    if (phase === "complete") return TransactionStatus.COMPLETE;
    if (phase === "failed" || phase === "timedOut") return TransactionStatus.FAILED;
    return TransactionStatus.PENDING;
  }

  /**
   * Append an error log to a ramping process.
   * This function limits the number of error logs to 100 per ramping process.
   * @param id The ID of the ramping process
   * @param errorLog The error log to append
   */
  public async appendErrorLog(id: string, errorLog: RampErrorLog): Promise<void> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      throw new APIError({
        message: "Ramp not found",
        status: httpStatus.NOT_FOUND
      });
    }

    RampService.assertOwnedByThisFlow(rampState, "Ramp");

    // Limit the number of error logs to 100
    const updatedErrorLogs = [...(rampState.errorLogs || []), errorLog].slice(-100);
    await rampState.update({
      errorLogs: updatedErrorLogs
    });
  }

  /**
   * Sum the BRL-equivalent volume of all in-progress ramps for a given taxId and direction.
   */
  private async getPendingBrlVolume(taxId: string, direction: RampDirection): Promise<Big> {
    const normalizedTaxId = normalizeTaxId(taxId);

    const pendingRamps = await RampState.findAll({
      include: [{ as: "quote", model: QuoteTicket }],
      where: {
        currentPhase: { [Op.notIn]: ["complete", "failed", "timedOut", "initial"] },
        "state.taxId": normalizedTaxId,
        type: direction
      }
    });

    let totalPendingBrl = new Big(0);
    for (const ramp of pendingRamps) {
      const quote = (ramp as RampState & { quote: QuoteTicket }).quote;
      if (!quote) continue;

      const brlAmount = direction === RampDirection.BUY ? quote.inputAmount : quote.outputAmount;
      totalPendingBrl = totalPendingBrl.plus(brlAmount);
    }

    return totalPendingBrl;
  }

  /**
   * Validate the ramp amount against both per-currency (BRL) and global (*) limits,
   * accounting for pending ramp volume that hasn't settled on Avenia yet.
   */
  private async validateAveniaLimits(
    amountBrl: string,
    limits: Limit[],
    direction: RampDirection,
    taxId: string
  ): Promise<void> {
    const pendingBrl = await this.getPendingBrlVolume(taxId, direction);
    const effectiveAmountBrl = new Big(amountBrl).plus(pendingBrl);

    const brlLimits = limits.find(limit => limit.currency === BrlaCurrency.BRL);
    if (!brlLimits) {
      throw new APIError({
        message: "BRL limits not found.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const brlRemaining =
      direction === RampDirection.BUY
        ? Number(brlLimits.maxFiatIn) - Number(brlLimits.usedLimit.usedFiatIn)
        : Number(brlLimits.maxFiatOut) - Number(brlLimits.usedLimit.usedFiatOut);

    if (effectiveAmountBrl.gt(brlRemaining)) {
      throw new APIError({
        message: "Amount exceeds BRL limit.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const globalLimits = limits.find(limit => limit.currency === "*");
    if (globalLimits) {
      const priceFeedService = PriceFeedService.getInstance();
      const effectiveAmountUsd = await priceFeedService.convertCurrency(
        effectiveAmountBrl.toFixed(2),
        FiatToken.BRL,
        FiatToken.USD,
        2
      );

      const globalRemaining =
        direction === RampDirection.BUY
          ? Number(globalLimits.maxFiatIn) - Number(globalLimits.usedLimit.usedFiatIn)
          : Number(globalLimits.maxFiatOut) - Number(globalLimits.usedLimit.usedFiatOut);

      if (Number(effectiveAmountUsd) > globalRemaining) {
        throw new APIError({
          message: "Amount exceeds global limit.",
          status: httpStatus.BAD_REQUEST
        });
      }
    }
  }

  /**
   * BRLA. Get subaccount and validate pix and tax id.
   */
  public async validateBrlaOfframpRequest(
    taxId: string,
    pixKey: string,
    receiverTaxId: string,
    amount: string
  ): Promise<{ wallets: { evm: string }; brCode: string }> {
    const brlaApiService = BrlaApiService.getInstance();

    const aveniaCustomer = await findAveniaCustomerByTaxId(taxId);
    if (!aveniaCustomer) {
      throw new APIError({
        message: "Subaccount not found",
        status: httpStatus.BAD_REQUEST
      });
    }
    const aveniaSubAccountId = aveniaCustomer.providerSubaccountId ?? "";
    const subAccountData = await brlaApiService.subaccountInfo(aveniaSubAccountId);
    const subaccountLimits = await brlaApiService.getSubaccountUsedLimit(aveniaSubAccountId);
    if (!subaccountLimits) {
      throw new APIError({
        message: "Failed to fetch subaccount limits",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // To make it harder to extract information, both the pixKey and the receiverTaxId are required to be correct.
    // The user-facing error stays generic, but server-side logs differentiate failure modes for diagnosis.
    let pixKeyData;
    try {
      pixKeyData = await brlaApiService.validatePixKey(pixKey);
    } catch (error) {
      logger.warn(
        `validateBrlaOfframpRequest: pix-info lookup failed for pixKey=${pixKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new APIError({
        message: "Invalid pixKey or receiverTaxId.",
        status: httpStatus.BAD_REQUEST
      });
    }

    let masksMatch: boolean;
    try {
      // Do NOT pass the masked taxId through normalizeTaxId: that helper strips all
      // non-digits, which would also strip the `*` mask characters and break the
      // length-aligned comparison done by validateMaskedNumber.
      masksMatch = validateMaskedNumber(pixKeyData.taxId, normalizeTaxId(receiverTaxId));
    } catch (error) {
      logger.warn(
        `validateBrlaOfframpRequest: pix key owner taxId is not comparable to receiverTaxId. masked=${pixKeyData.taxId}, provided=${normalizeTaxId(
          receiverTaxId
        )}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw new APIError({
        message: "Invalid pixKey or receiverTaxId.",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!masksMatch) {
      logger.warn(
        `validateBrlaOfframpRequest: pix key owner taxId does not match receiverTaxId. masked=${pixKeyData.taxId}, provided=${normalizeTaxId(receiverTaxId)}`
      );
      throw new APIError({
        message: "Invalid pixKey or receiverTaxId.",
        status: httpStatus.BAD_REQUEST
      });
    }

    await this.validateAveniaLimits(amount, subaccountLimits.limitInfo.limits, RampDirection.SELL, taxId);

    const evmAddress = subAccountData?.wallets.find(w => w.chain === "EVM")?.walletAddress;

    if (!evmAddress) {
      throw new APIError({
        message: "EVM wallet not found in subaccount.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    return { brCode: subAccountData.brCode, wallets: { evm: evmAddress } };
  }

  /**
   * BRLA. Validate the onramp request. Returns appropiate pay in code if valid.
   */
  public async validateBrlaOnrampRequest(
    taxId: string,
    quote: QuoteTicket,
    amount: string
  ): Promise<{ brCode: string; aveniaTicketId: string }> {
    const brlaApiService = BrlaApiService.getInstance();

    const aveniaCustomer = await findAveniaCustomerByTaxId(taxId);
    if (!aveniaCustomer) {
      throw new APIError({
        message: "Subaccount not found.",
        status: httpStatus.BAD_REQUEST
      });
    }
    const aveniaSubAccountId = aveniaCustomer.providerSubaccountId ?? "";

    const accountLimits = await brlaApiService.getSubaccountUsedLimit(aveniaSubAccountId);
    if (!accountLimits) {
      throw new APIError({
        message: "Failed to fetch subaccount limits.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    await this.validateAveniaLimits(amount, accountLimits.limitInfo.limits, RampDirection.BUY, taxId);

    const aveniaQuote = await brlaApiService.createPayInQuote({
      inputAmount: String(amount),
      inputCurrency: BrlaCurrency.BRL,
      inputPaymentMethod: AveniaPaymentMethod.PIX,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.INTERNAL,
      outputThirdParty: false,
      subAccountId: aveniaSubAccountId
    });

    const aveniaTicket = await brlaApiService.createPixInputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          // This means we are paying out to the subAccount itself.
          beneficiaryWalletId: "00000000-0000-0000-0000-000000000000"
        },
        ticketBrlPixInput: {
          additionalData: generateReferenceLabel(quote)
        }
      },
      aveniaSubAccountId
    );

    return { aveniaTicketId: aveniaTicket.id, brCode: aveniaTicket.brCode };
  }

  private async prepareOfframpBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    userId: string
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; depositQrCode?: string }> {
    if (!additionalData || !additionalData.pixDestination) {
      throw new APIError({
        message: "pixDestination is required for offramp to BRL",
        status: httpStatus.BAD_REQUEST
      });
    }

    const aveniaAccount = await resolveAveniaAccountForRamp(userId, additionalData.taxId);
    const derivedTaxId = aveniaAccount.taxId;
    const derivedReceiverTaxId = normalizeTaxId(additionalData.receiverTaxId || derivedTaxId);

    const subaccount = await this.validateBrlaOfframpRequest(
      derivedTaxId,
      additionalData.pixDestination,
      derivedReceiverTaxId,
      quote.outputAmount
    );

    const { unsignedTxs, stateMeta } = await prepareOfframpTransactions({
      brlaEvmAddress: subaccount.wallets.evm,
      pixDestination: additionalData.pixDestination,
      quote,
      receiverTaxId: derivedReceiverTaxId,
      signingAccounts: normalizedSigningAccounts,
      taxId: derivedTaxId,
      userAddress: additionalData.walletAddress,
      userId
    });

    return { depositQrCode: subaccount.brCode, stateMeta, unsignedTxs };
  }

  private async prepareOfframpNonBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    transaction: Transaction,
    userId: string
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata> }> {
    // We refresh the quote. It will be used in the transaction creation process, right after this.
    if (isAlfredpayToken(quote.outputCurrency as FiatToken) && quote.metadata.alfredpayOfframp) {
      const toCurrency = quote.outputCurrency as unknown as AlfredpayFiatCurrency;
      await this.refreshAlfredpayOfframpQuoteIfMatching(
        quote,
        quote.metadata.alfredpayOfframp,
        toCurrency,
        userId,
        transaction
      );
    }

    const { unsignedTxs, stateMeta } = await prepareOfframpTransactions({
      destinationAddress: additionalData?.destinationAddress,
      email: additionalData?.email,
      fiatAccountId: additionalData?.fiatAccountId as string | undefined,
      ipAddress: additionalData?.ipAddress,
      quote,
      signingAccounts: normalizedSigningAccounts,
      userAddress: additionalData?.walletAddress,
      userId
    });

    return { stateMeta, unsignedTxs };
  }

  private async prepareAveniaOnrampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[],
    userId: string
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; depositQrCode: string; aveniaTicketId: string }> {
    if (!additionalData || !additionalData.destinationAddress) {
      throw new APIError({
        message: "Parameter destinationAddress is required for onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    const hasEvmEphemeral = signingAccounts.some(ephemeral => ephemeral.type === EphemeralAccountType.EVM);
    if (!hasEvmEphemeral) {
      throw new APIError({
        message: "Base ephemeral not found",
        status: httpStatus.BAD_REQUEST
      });
    }

    const aveniaAccount = await resolveAveniaAccountForRamp(userId, additionalData.taxId);
    const derivedTaxId = aveniaAccount.taxId;

    const { brCode, aveniaTicketId } = await this.validateBrlaOnrampRequest(derivedTaxId, quote, quote.inputAmount);

    const params: AveniaOnrampTransactionParams = {
      destinationAddress: additionalData.destinationAddress,
      quote,
      signingAccounts: normalizedSigningAccounts,
      taxId: derivedTaxId
    };

    const { unsignedTxs, stateMeta } = await prepareOnrampTransactions(params);

    return { aveniaTicketId, depositQrCode: brCode, stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
  }

  private async prepareAlfredpayOnrampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    userId: string
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
  }> {
    if (!additionalData || !additionalData.destinationAddress) {
      throw new APIError({
        message: "Parameter destinationAddress is required for Alfredpay onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    await resolveAlfredpayCustomerId(quote.inputCurrency, userId);

    const { unsignedTxs, stateMeta } = await prepareOnrampTransactions({
      destinationAddress: additionalData.destinationAddress,
      quote,
      signingAccounts: normalizedSigningAccounts,
      userId
    });

    return { stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
  }

  private async prepareMykoboOnrampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    userId: string
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
    ibanPaymentData?: IbanPaymentData;
  }> {
    if (!additionalData?.destinationAddress || !additionalData?.ipAddress) {
      throw new APIError({
        message: "Parameters destinationAddress and ipAddress are required for Mykobo EUR onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    // The Mykobo email is derived from the effective user's profile (and KYC must be approved);
    // a client-supplied email is accepted only if it matches. See resolveMykoboCustomerForUser.
    const { email } = await resolveMykoboCustomerForUser(userId, additionalData.email);

    const evmEphemeralEntry = normalizedSigningAccounts.find(account => account.type === "EVM");
    if (!evmEphemeralEntry) {
      throw new APIError({
        message: "EVM ephemeral account is required for Mykobo EUR onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    const mykobo = MykoboApiService.getInstance();
    const intent = await mykobo.createTransactionIntent({
      currency: MykoboCurrency.EURC,
      email_address: email,
      ip_address: additionalData.ipAddress,
      transaction_type: MykoboTransactionType.DEPOSIT,
      value: new Big(quote.inputAmount).toFixed(2, 0),
      wallet_address: evmEphemeralEntry.address
    });

    // Mocking mykobo intent call
    // const intent = {
    //   instructions: {
    //     bank_account_name: "Mykobo Test",
    //     iban: "DE89370400440532013000"
    //   },
    //   transaction: {
    //     id: "mykobo-transaction-id",
    //     reference: "mykobo-transaction-reference"
    //   }
    // };
    const instructions = intent.instructions;
    if (!instructions || !("iban" in instructions)) {
      throw new APIError({
        message: "Mykobo deposit intent did not return IBAN instructions",
        status: httpStatus.BAD_GATEWAY
      });
    }

    const { unsignedTxs, stateMeta } = await prepareMykoboToEvmOnrampTransactions({
      destinationAddress: additionalData.destinationAddress,
      ipAddress: additionalData.ipAddress,
      mykoboEmail: email,
      mykoboTransactionId: intent.transaction.id,
      mykoboTransactionReference: intent.transaction.reference,
      quote,
      signingAccounts: normalizedSigningAccounts
    });

    const ibanPaymentData: IbanPaymentData = {
      bic: "",
      iban: instructions.iban,
      receiverName: instructions.bank_account_name,
      reference: intent.transaction.reference
    };

    return { ibanPaymentData, stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
  }

  private async prepareRampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[],
    transaction: Transaction,
    userId: string
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
    depositQrCode?: string;
    aveniaTicketId?: string;
    ibanPaymentData?: IbanPaymentData;
  }> {
    switch (selectRampTransactionPreparationKind(quote, additionalData)) {
      case RampTransactionPreparationKind.OfframpBrl:
        return this.prepareOfframpBrlTransactions(quote, normalizedSigningAccounts, additionalData, userId);

      case RampTransactionPreparationKind.OfframpNonBrl:
        return this.prepareOfframpNonBrlTransactions(quote, normalizedSigningAccounts, additionalData, transaction, userId);

      case RampTransactionPreparationKind.OnrampMykobo:
        return this.prepareMykoboOnrampTransactions(quote, normalizedSigningAccounts, additionalData, userId);

      case RampTransactionPreparationKind.OnrampAlfredpay:
        return this.prepareAlfredpayOnrampTransactions(quote, normalizedSigningAccounts, additionalData, userId);

      case RampTransactionPreparationKind.OnrampAvenia:
        return this.prepareAveniaOnrampTransactions(quote, normalizedSigningAccounts, additionalData, signingAccounts, userId);
    }
  }

  private async ephemeralPresignChecksPass(rampState: RampState): Promise<boolean> {
    const ephemerals: { [key in EphemeralAccountType]: string } = {
      EVM: rampState.state.evmEphemeralAddress,
      Substrate: rampState.state.substrateEphemeralAddress
    };

    try {
      await validatePresignedTxs(rampState.type, rampState.presignedTxs || [], ephemerals, rampState.unsignedTxs);
      return true;
    } catch {
      return false;
    }
  }

  private async tryReleaseDepositQr(rampState: RampState, quote: QuoteTicket, transaction: Transaction): Promise<boolean> {
    if (rampState.state.presignChecksPass) return true;

    const ephemerals: { [key in EphemeralAccountType]: string } = {
      EVM: rampState.state.evmEphemeralAddress,
      Substrate: rampState.state.substrateEphemeralAddress
    };

    try {
      this.validateRampStateData(rampState, quote);
      await validatePresignedTxs(rampState.type, rampState.presignedTxs || [], ephemerals, rampState.unsignedTxs);
    } catch (err) {
      logger.info(`[tryReleaseDepositQr] rampId=${rampState.id} validation threw: ${err instanceof Error ? err.message : err}`);
      return false;
    }

    await rampState.update(
      {
        state: {
          ...rampState.state,
          presignChecksPass: true
        }
      },
      { transaction }
    );
    return true;
  }

  private validateRampStateData(rampState: RampState, quote: QuoteTicket): void {
    if (rampState.type === RampDirection.SELL && !isAlfredpayToken(quote.outputCurrency as FiatToken)) {
      if (rampState.from === Networks.AssetHub && !rampState.state.assethubToPendulumHash) {
        throw new APIError({
          message: `Missing required additional data 'assethubToPendulumHash' for ${rampState.type} ramp. Cannot proceed.`,
          status: httpStatus.BAD_REQUEST
        });
      } else if (rampState.from !== Networks.AssetHub) {
        const requiresSquidSwapHash = rampState.unsignedTxs.some(tx => tx.phase === "squidRouterSwap");
        if (requiresSquidSwapHash && !rampState.state.squidRouterSwapHash) {
          throw new APIError({
            message: `Missing required additional data 'squidRouterSwapHash' for ${rampState.type} ramp. Cannot proceed.`,
            status: httpStatus.BAD_REQUEST
          });
        }
      }
    }
  }

  private mapPhaseToWebhookStatus(phase: RampPhase): TransactionStatus {
    if (phase === "complete") return TransactionStatus.COMPLETE;
    if (phase === "failed" || phase === "timedOut") return TransactionStatus.FAILED;
    return TransactionStatus.PENDING;
  }

  private async cancelRamp(id: string): Promise<void> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      throw new Error("Ramp not found.");
    }

    RampService.assertOwnedByThisFlow(rampState, "Ramp");

    await this.updateRampState(id, {
      currentPhase: "timedOut"
    });
  }

  private async notifyStatusChangeIfNeeded(rampState: RampState, oldPhase: RampPhase, newPhase: RampPhase): Promise<void> {
    const oldStatus = this.mapPhaseToWebhookStatus(oldPhase);
    const newStatus = this.mapPhaseToWebhookStatus(newPhase);

    // Only notify if status has changed and new status is not FAILED
    if (oldStatus !== newStatus && newStatus !== TransactionStatus.FAILED) {
      webhookDeliveryService
        .triggerStatusChange(rampState.quoteId, rampState.state.sessionId || null, rampState.id, newPhase, rampState.type)
        .catch(error => {
          logger.error(`Error triggering STATUS_CHANGE webhook for ${rampState.id}:`, error);
        });
    }
  }

  protected async logPhaseTransition(id: string, newPhase: RampPhase, metadata?: StateMetadata): Promise<void> {
    const rampState = await RampState.findByPk(id);
    if (!rampState) {
      throw new Error(`RampState with id ${id} not found`);
    }

    RampService.assertOwnedByThisFlow(rampState, "Ramp");

    const oldPhase = rampState.currentPhase;

    await super.logPhaseTransition(id, newPhase, metadata);

    if (oldPhase !== newPhase) {
      await this.notifyStatusChangeIfNeeded(rampState, oldPhase, newPhase);
    }
  }

  private async processAlfredpayOnrampStart(
    rampState: RampState,
    quote: QuoteTicket,
    transaction: Transaction
  ): Promise<AlfredpayFiatPaymentInstructions | undefined> {
    if (rampState.state.alfredpayTransactionId) {
      return;
    }

    const alfredpayService = AlfredpayApiService.getInstance();
    const originalAlfredpayMint = quote.metadata.alfredpayMint;
    const originalQuoteId = originalAlfredpayMint?.quoteId;

    if (!originalQuoteId || !originalAlfredpayMint) {
      throw new APIError({
        message: "Missing Alfredpay quote ID in metadata",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.userId) {
      throw new APIError({
        message: "Missing user ID in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.state.destinationAddress) {
      throw new APIError({
        message: "Destination address not found in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.state.alfredpayUserId) {
      throw new APIError({
        message: "Missing Alfredpay user ID in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Alfredpay quotes expire ~30s after creation, which is often shorter than the time the
    // user needs to sign ephemeral txs in the UI. Try refreshing the Alfredpay quote
    const fromCurrency = quote.inputCurrency as unknown as AlfredpayFiatCurrency;
    const effectiveQuoteId = await this.refreshAlfredpayOnrampQuoteIfMatching(
      quote,
      originalAlfredpayMint,
      fromCurrency,
      rampState.userId,
      transaction
    );

    const orderRequest: CreateAlfredpayOnrampRequest = {
      amount: quote.inputAmount,
      chain: AlfredpayChain.MATIC,
      customerId: rampState.state.alfredpayUserId,
      depositAddress: rampState.state.evmEphemeralAddress,
      fromCurrency,
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      quoteId: effectiveQuoteId,
      toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
    };

    const order = await alfredpayService.createOnramp(orderRequest);

    await rampState.update(
      {
        state: {
          ...rampState.state,
          alfredpayTransactionId: order.transaction.transactionId,
          fiatPaymentInstructions: order.fiatPaymentInstructions
        }
      },
      { transaction }
    );

    return order.fiatPaymentInstructions;
  }

  private async refreshAlfredpayOnrampQuoteIfMatching(
    quote: QuoteTicket,
    originalAlfredpayMint: NonNullable<QuoteTicket["metadata"]["alfredpayMint"]>,
    fromCurrency: AlfredpayFiatCurrency,
    userId: string,
    transaction: Transaction
  ): Promise<string> {
    const alfredpayService = AlfredpayApiService.getInstance();
    const originalQuoteId = originalAlfredpayMint.quoteId;

    const customerId = await resolveAlfredpayCustomerId(fromCurrency, userId);

    try {
      const freshQuote = await alfredpayService.createOnrampQuote({
        chain: AlfredpayChain.MATIC,
        fromAmount: new Big(quote.inputAmount).toString(),
        fromCurrency,
        metadata: {
          businessId: "vortex",
          customerId
        },
        paymentMethodType: AlfredpayPaymentMethodType.BANK,
        toCurrency: ALFREDPAY_ONCHAIN_CURRENCY
      });

      // outputAmountDecimal arrives as a serialized Big after JSONB roundtrip; normalize via Big().
      const originalToAmount = new Big(originalAlfredpayMint.outputAmountDecimal as unknown as string);
      const freshToAmount = new Big(freshQuote.toAmount);

      const originalFee = new Big(originalAlfredpayMint.fee as unknown as string);
      const freshFee = AlfredpayApiService.sumFeesByCurrency(freshQuote.fees, fromCurrency);

      if (!freshToAmount.eq(originalToAmount) || !freshFee.eq(originalFee)) {
        logger.warn(
          `[refreshAlfredpayOnrampQuote] Quote ${quote.id}: refreshed Alfredpay quote drifted. ` +
            `toAmount original=${originalToAmount.toString()} fresh=${freshToAmount.toString()}, ` +
            `fee original=${originalFee.toString()} fresh=${freshFee.toString()}. ` +
            `Falling back to original quoteId ${originalQuoteId}.`
        );
        return originalQuoteId;
      }

      await quote.update(
        {
          metadata: {
            ...quote.metadata,
            alfredpayMint: {
              ...originalAlfredpayMint,
              expirationDate: new Date(freshQuote.expiration),
              quoteId: freshQuote.quoteId
            }
          }
        },
        { transaction }
      );

      logger.info(
        `[refreshAlfredpayOnrampQuote] Quote ${quote.id}: swapped Alfredpay quote ${originalQuoteId} -> ${freshQuote.quoteId}.`
      );
      return freshQuote.quoteId;
    } catch (error) {
      logger.warn(
        `[refreshAlfredpayOnrampQuote] Quote ${quote.id}: refresh failed (${
          error instanceof Error ? error.message : String(error)
        }). Falling back to original quoteId ${originalQuoteId}.`
      );
      return originalQuoteId;
    }
  }

  private async refreshAlfredpayOfframpQuoteIfMatching(
    quote: QuoteTicket,
    originalAlfredpayOfframp: NonNullable<QuoteTicket["metadata"]["alfredpayOfframp"]>,
    toCurrency: AlfredpayFiatCurrency,
    userId: string,
    transaction: Transaction
  ): Promise<string> {
    const alfredpayService = AlfredpayApiService.getInstance();
    const originalQuoteId = originalAlfredpayOfframp.quoteId;

    const customerId = await resolveAlfredpayCustomerId(toCurrency, userId);

    const freshQuote = await alfredpayService.createOfframpQuote({
      chain: AlfredpayChain.MATIC,
      fromAmount: originalAlfredpayOfframp.inputAmountDecimal.toString(),
      fromCurrency: ALFREDPAY_ONCHAIN_CURRENCY,
      metadata: { businessId: "vortex", customerId },
      paymentMethodType: AlfredpayPaymentMethodType.BANK,
      toCurrency
    } satisfies CreateAlfredpayOfframpQuoteRequest);

    const originalToAmount = new Big(originalAlfredpayOfframp.outputAmountDecimal as unknown as string);
    const freshToAmount = new Big(freshQuote.toAmount);

    const originalFee = new Big(originalAlfredpayOfframp.fee as unknown as string);
    const freshFee = AlfredpayApiService.sumFeesByCurrency(freshQuote.fees, toCurrency);

    if (!freshToAmount.eq(originalToAmount) || !freshFee.eq(originalFee)) {
      throw new APIError({
        message:
          `[refreshAlfredpayOfframpQuote] Quote ${quote.id}: refreshed Alfredpay offramp quote drifted. ` +
          `toAmount original=${originalToAmount.toString()} fresh=${freshToAmount.toString()}, ` +
          `fee original=${originalFee.toString()} fresh=${freshFee.toString()}. ` +
          "Cannot proceed with offramp order.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    await quote.update(
      {
        metadata: {
          ...quote.metadata,
          alfredpayOfframp: {
            ...originalAlfredpayOfframp,
            expirationDate: new Date(freshQuote.expiration),
            quoteId: freshQuote.quoteId
          }
        }
      },
      { transaction }
    );

    logger.info(
      `[refreshAlfredpayOfframpQuote] Quote ${quote.id}: swapped Alfredpay offramp quote ${originalQuoteId} -> ${freshQuote.quoteId}.`
    );
    return freshQuote.quoteId;
  }

  private async processAlfredpayOfframpStart(
    rampState: RampState,
    quote: QuoteTicket,
    transaction: Transaction
  ): Promise<void> {
    if (rampState.state.alfredpayTransactionId) {
      return;
    }

    const alfredpayQuoteId = quote.metadata.alfredpayOfframp?.quoteId;

    if (!alfredpayQuoteId) {
      throw new APIError({
        message: "Missing Alfredpay quote ID in metadata",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.state.alfredpayUserId) {
      throw new APIError({
        message: "Missing Alfredpay user ID in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.state.fiatAccountId) {
      throw new APIError({
        message: "Missing fiatAccountId in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }

    if (!rampState.state.walletAddress) {
      throw new APIError({
        message: "Wallet address not found in ramp state",
        status: httpStatus.BAD_REQUEST
      });
    }
  }
}

export default new RampService();
