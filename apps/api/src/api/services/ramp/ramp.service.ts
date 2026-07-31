import { isDeepStrictEqual } from "node:util";
import { decodeAddress, encodeAddress } from "@polkadot/util-crypto";
import {
  AccountMeta,
  AlfredpayFiatPaymentInstructions,
  EphemeralAccountType,
  FiatToken,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  IbanPaymentData,
  isAlfredpayToken,
  Networks,
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
  UpdateRampResponse
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { Op, QueryTypes, Transaction, WhereOptions } from "sequelize";
import { isAddress } from "viem";
import sequelize from "../../../config/database";
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
} from "../../services/phases/blocks/core/discount";
import { getTargetFiatCurrency } from "../../services/phases/blocks/core/helpers";
import { accountCapabilities } from "../phases/blocks/core/accounts";
import { getFlowMetadata } from "../phases/blocks/core/metadata";
import { resolvePersistedBlockFlow } from "../phases/blocks/flows/catalog";
import { StateMetadata } from "../phases/meta-state-types";
import phaseProcessor from "../phases/phase-processor";
import { validatePresignedTxs } from "../transactions/validation";
import webhookDeliveryService from "../webhook/webhook-delivery.service";
import { BaseRampService } from "./base.service";
import { validateEphemeralAccountsFresh } from "./ephemeral-freshness";
import { getFinalTransactionHashForRampV2 } from "./helpers";

const RAMP_START_EXPIRATION_TIME_SECONDS = 900; // 15 minutes

function mergeCompatibilityRecords(label: string, records: readonly unknown[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${label} contains a non-object compatibility record`);
    }
    for (const [key, value] of Object.entries(record)) {
      if (Object.hasOwn(merged, key) && !isDeepStrictEqual(merged[key], value)) {
        throw new Error(`${label} contains conflicting values for compatibility field ${key}`);
      }
      merged[key] = value;
    }
  }
  return merged;
}

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
    const address = type === EphemeralAccountType.Substrate ? encodeAddress(decodeAddress(account.address)) : account.address;

    normalizedSigningAccounts.push({
      address,
      type: type
    });

    ephemerals[type] = address;
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
    const recipientContextKeys = [
      "recipientId",
      "recipientRelationshipId",
      "recipientPayoutReferenceId",
      "senderRecipientId"
    ] as const;
    const unsupportedRecipientKey = recipientContextKeys.find(key =>
      Object.prototype.hasOwnProperty.call(request.additionalData ?? {}, key)
    );
    if (unsupportedRecipientKey) {
      throw new APIError({
        message: "Recipient-directed payout is not supported by ramp registration; recipient eligibility is advisory only.",
        status: httpStatus.BAD_REQUEST
      });
    }

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

      const user = await User.findByPk(effectiveUserId, { transaction });
      if (!user) {
        throw new APIError({
          message: "Authenticated user profile not found.",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Before removing this kill-switch, add a hermetic EUR corridor scenario in
      // apps/api/src/tests/corridors/ (the Mykobo corridors are currently covered by
      // RUN_LIVE_TESTS-gated tests only — see docs/testing.md).
      if (quote.inputCurrency === FiatToken.EURC || quote.outputCurrency === FiatToken.EURC) {
        throw new APIError({
          message: "EUR ramps are currently disabled",
          status: httpStatus.SERVICE_UNAVAILABLE
        });
      }

      const { normalizedSigningAccounts, ephemerals } = normalizeAndValidateSigningAccounts(signingAccounts);

      const ephemeralLockKeys = normalizedSigningAccounts
        .map(
          account =>
            `${account.type}:${account.type === EphemeralAccountType.EVM ? account.address.toLowerCase() : account.address}`
        )
        .sort();
      for (const key of ephemeralLockKeys) {
        await sequelize.query("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", {
          replacements: { key },
          transaction
        });
      }

      const activeRampWithEphemeral = await sequelize.query<{ id: string }>(
        `SELECT id FROM ramp_states
         WHERE current_phase NOT IN ('complete', 'failed', 'timedOut')
           AND (
             (:evmAddress IS NOT NULL AND lower(state->>'evmEphemeralAddress') = :evmAddress)
             OR (:substrateAddress IS NOT NULL AND state->>'substrateEphemeralAddress' = :substrateAddress)
           )
         LIMIT 1`,
        {
          replacements: {
            evmAddress: ephemerals.EVM?.toLowerCase() ?? null,
            substrateAddress: ephemerals.Substrate ?? null
          },
          transaction,
          type: QueryTypes.SELECT
        }
      );
      if (activeRampWithEphemeral.length > 0) {
        throw new APIError({
          message: `An active ramp already uses one of the supplied ephemeral accounts: ${activeRampWithEphemeral[0].id}`,
          status: httpStatus.CONFLICT
        });
      }

      await validateEphemeralAccountsFresh(ephemerals, quote);

      const { unsignedTxs, stateMeta, depositQrCode, ibanPaymentData, aveniaTicketId } = await this.prepareRampTransactions(
        quote,
        normalizedSigningAccounts,
        additionalData,
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
        partner = await resolveActivePartnerById(
          pricingPartnerId,
          quote.rampType,
          getTargetFiatCurrency(quote.rampType, quote.inputCurrency, quote.outputCurrency)
        );
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

      const rampState = await RampState.findByPk(rampId, { lock: Transaction.LOCK.UPDATE, transaction });
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

      const { achPaymentData } = await this.startPersistedFlow(rampState, quote, transaction);

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
      const rampState = await RampState.findByPk(request.rampId, { lock: Transaction.LOCK.UPDATE, transaction });

      if (!rampState) {
        throw new APIError({
          message: "Ramp not found",
          status: httpStatus.NOT_FOUND
        });
      }

      RampService.assertOwnedByThisFlow(rampState, "Ramp");

      if (rampState.currentPhase !== "initial") {
        throw new APIError({
          message: "Ramp is not in a state that allows starting",
          status: httpStatus.CONFLICT
        });
      }

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

      await this.startPersistedFlow(rampState, quote, transaction);

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

    const { fees, subsidyDisplay } = getFlowMetadata(quote.metadata).globals;
    const usdFees = fees.usd;
    const fiatFees = fees.displayFiat;
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
      ...(subsidyDisplay
        ? {
            discountCurrency: subsidyDisplay.currency,
            discountFiat: subsidyDisplay.fiat,
            discountUsd: subsidyDisplay.usd
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
   * Get ramp history for an owner, optionally filtered to a wallet address.
   */
  public async getRampHistory(
    walletAddress: string | undefined,
    owner: { partnerId: string } | { userId: string },
    limit?: number,
    offset?: number
  ): Promise<GetRampHistoryResponse> {
    const baseWhere = {
      ...(walletAddress
        ? { [Op.or]: [{ "state.walletAddress": walletAddress }, { "state.destinationAddress": walletAddress }] }
        : {}),
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
          expiresAt: new Date(ramp.createdAt.getTime() + RAMP_START_EXPIRATION_TIME_SECONDS * 1000).toISOString(),
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
          type: ramp.type,
          walletAddress: ramp.state.destinationAddress ?? ramp.state.walletAddress
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

  private async prepareRampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    transaction: Transaction,
    userId: string
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
    depositQrCode?: string;
    aveniaTicketId?: string;
    ibanPaymentData?: IbanPaymentData;
  }> {
    if (
      (quote.inputCurrency === FiatToken.EURC || quote.outputCurrency === FiatToken.EURC) &&
      (!additionalData?.destinationAddress || !additionalData.ipAddress)
    ) {
      throw new APIError({
        message: `Parameters destinationAddress and ipAddress are required for Mykobo EUR ${quote.rampType === RampDirection.BUY ? "onramp" : "offramp"}`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (quote.rampType === RampDirection.BUY && !additionalData?.destinationAddress) {
      const provider = isAlfredpayToken(quote.inputCurrency as FiatToken) ? "Alfredpay " : "";
      throw new APIError({
        message: `Parameter destinationAddress is required for ${provider}onramp`,
        status: httpStatus.BAD_REQUEST
      });
    }
    if (quote.rampType === RampDirection.BUY && quote.inputCurrency === FiatToken.BRL) {
      if (!normalizedSigningAccounts.some(account => account.type === EphemeralAccountType.EVM)) {
        throw new APIError({ message: "Base ephemeral not found", status: httpStatus.BAD_REQUEST });
      }
      if (
        quote.to === Networks.AssetHub &&
        !normalizedSigningAccounts.some(account => account.type === EphemeralAccountType.Substrate)
      ) {
        throw new APIError({ message: "Pendulum ephemeral not found", status: httpStatus.BAD_REQUEST });
      }
    }

    const metadata = getFlowMetadata(quote.metadata);
    const flow = resolvePersistedBlockFlow(metadata);
    const quoteFields = quote.get({ plain: true });
    const registered = await flow.register({
      authenticatedUser: { id: userId },
      input: additionalData ?? {},
      ipAddress: additionalData?.ipAddress,
      metadata,
      quote: quoteFields,
      signingAccounts: normalizedSigningAccounts,
      transaction
    });
    await quote.update({ metadata: registered.metadata as unknown as QuoteTicket["metadata"] }, { transaction });
    const prepared = await flow.prepareTxs({
      accounts: accountCapabilities(normalizedSigningAccounts),
      destinationAddress: additionalData?.destinationAddress,
      metadata: registered.metadata,
      quote: quoteFields,
      registrationFacts: registered.registrationFacts,
      userId
    });
    const compatibilityState = mergeCompatibilityRecords("Prepared ramp state", [
      ...Object.values(registered.registrationFacts),
      ...Object.values(prepared.stateMeta.blockState ?? {})
    ]) as Partial<StateMetadata>;
    const responseArtifacts = mergeCompatibilityRecords(
      "Ramp registration response",
      Object.values(registered.responseArtifacts)
    ) as {
      aveniaTicketId?: string;
      depositQrCode?: string;
      ibanPaymentData?: IbanPaymentData;
    };
    return {
      ...responseArtifacts,
      aveniaTicketId: responseArtifacts.aveniaTicketId ?? compatibilityState.aveniaTicketId,
      stateMeta: { ...prepared.stateMeta, ...compatibilityState },
      unsignedTxs: prepared.unsignedTxs
    };
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

  private async startPersistedFlow(
    rampState: RampState,
    quote: QuoteTicket,
    transaction: Transaction
  ): Promise<{ achPaymentData?: AlfredpayFiatPaymentInstructions }> {
    const metadata = getFlowMetadata(quote.metadata);
    const started = await resolvePersistedBlockFlow(metadata).start({
      metadata,
      quote: quote.get({ plain: true }),
      rampId: rampState.id,
      state: rampState.state,
      userId: rampState.userId ?? undefined
    });
    if (started.metadata !== metadata) {
      await quote.update({ metadata: started.metadata as unknown as QuoteTicket["metadata"] }, { transaction });
    }
    if (started.state !== rampState.state) {
      await rampState.update({ state: started.state }, { transaction });
    }
    return Object.assign({}, ...Object.values(started.responseArtifacts));
  }
}

export default new RampService();
