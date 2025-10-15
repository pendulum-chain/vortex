import {
  AccountMeta,
  AveniaPaymentMethod,
  BrlaApiService,
  BrlaCurrency,
  EvmNetworks,
  FiatToken,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  generateReferenceLabel,
  IbanPaymentData,
  MoneriumErrors,
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
  UpdateRampResponse,
  validateMaskedNumber
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import { SEQUENCE_TIME_WINDOW_IN_SECONDS } from "../../../constants/constants";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import TaxId from "../../../models/taxId.model";
import { APIError } from "../../errors/api-error";
import { createEpcQrCodeData, getIbanForAddress, getMoneriumUserProfile } from "../monerium";
import { StateMetadata } from "../phases/meta-state-types";
import phaseProcessor from "../phases/phase-processor";
import { validatePresignedTxs } from "../transactions";
import { prepareMoneriumEvmOfframpTransactions } from "../transactions/moneriumEvmOfframpTransactions";
import { prepareMoneriumEvmOnrampTransactions } from "../transactions/moneriumEvmOnrampTransactions";
import { prepareOfframpTransactions } from "../transactions/offrampTransactions";
import { prepareOnrampTransactions } from "../transactions/onrampTransactions";
import webhookDeliveryService from "../webhook/webhook-delivery.service";
import { BaseRampService } from "./base.service";

export function normalizeAndValidateSigningAccounts(accounts: AccountMeta[]): AccountMeta[] {
  const normalizedAccounts: AccountMeta[] = [];
  const allowedNetworks = new Set(Object.values(Networks).map(network => network.toLowerCase()));

  accounts.forEach(account => {
    if (!allowedNetworks.has(account.network.toLowerCase())) {
      throw new Error(`Invalid network: "${account.network}" provided.`);
    }

    const network = Object.values(Networks).find(network => network.toLowerCase() === account.network.toLowerCase());
    if (!network) {
      throw new Error(`Invalid network: "${account.network}" provided.`);
    }

    normalizedAccounts.push({
      address: account.address,
      network
    });
  });

  return normalizedAccounts;
}

export class RampService extends BaseRampService {
  private async prepareOfframpBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; depositQrCode?: string }> {
    if (!additionalData || !additionalData.pixDestination || !additionalData.taxId || !additionalData.receiverTaxId) {
      throw new Error("receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL");
    }

    const subaccount = await this.validateBrlaOfframpRequest(
      additionalData.taxId,
      additionalData.pixDestination,
      additionalData.receiverTaxId,
      quote.outputAmount
    );

    const { unsignedTxs, stateMeta } = await prepareOfframpTransactions({
      brlaEvmAddress: subaccount.wallets.evm,
      pixDestination: additionalData.pixDestination,
      quote,
      receiverTaxId: additionalData.receiverTaxId,
      signingAccounts: normalizedSigningAccounts,
      stellarPaymentData: additionalData.paymentData,
      taxId: additionalData.taxId,
      userAddress: additionalData.walletAddress
    });

    return { depositQrCode: subaccount.brCode, stateMeta, unsignedTxs };
  }

  private async prepareOfframpNonBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata> }> {
    const { unsignedTxs, stateMeta } = await prepareOfframpTransactions({
      quote,
      signingAccounts: normalizedSigningAccounts,
      stellarPaymentData: additionalData?.paymentData,
      userAddress: additionalData?.walletAddress
    });

    return { stateMeta, unsignedTxs };
  }

  private async prepareOnrampTransactionsMethod(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; depositQrCode: string; aveniaTicketId: string }> {
    if (!additionalData || additionalData.destinationAddress === undefined || additionalData.taxId === undefined) {
      throw new APIError({
        message: "Parameters destinationAddress and taxId are required for onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    const moonbeamEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Moonbeam);
    if (!moonbeamEphemeralEntry) {
      throw new APIError({
        message: "Moonbeam ephemeral not found",
        status: httpStatus.BAD_REQUEST
      });
    }

    const { brCode, aveniaTicketId } = await this.validateBrlaOnrampRequest(
      additionalData.taxId,
      quote,
      quote.inputAmount,
      moonbeamEphemeralEntry.address
    );

    const { unsignedTxs, stateMeta } = await prepareOnrampTransactions(
      quote,
      normalizedSigningAccounts,
      additionalData.destinationAddress,
      additionalData.taxId
    );

    return { aveniaTicketId, depositQrCode: brCode, stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
  }

  private async prepareMoneriumOnrampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
    depositQrCode: string;
    ibanPaymentData?: IbanPaymentData;
  }> {
    if (!additionalData || !additionalData.moneriumAuthToken || additionalData.destinationAddress === undefined) {
      throw new APIError({
        message: "Parameters moneriumAuthToken and destinationAddress are required for Monerium onramp",
        status: httpStatus.BAD_REQUEST
      });
    }

    try {
      // Validate the user mint address
      const ibanData = await getIbanForAddress(
        additionalData.destinationAddress,
        additionalData.moneriumAuthToken,
        quote.to as EvmNetworks // Fixme: assethub network type issue.
      );

      const userProfile = await getMoneriumUserProfile({
        authToken: additionalData.moneriumAuthToken,
        profileId: ibanData.profile
      });

      const { unsignedTxs, stateMeta } = await prepareMoneriumEvmOnrampTransactions({
        destinationAddress: additionalData.destinationAddress,
        quote,
        signingAccounts: normalizedSigningAccounts
      });

      const ibanPaymentData = {
        bic: ibanData.bic,
        iban: ibanData.iban
      };

      const ibanCode = createEpcQrCodeData({
        amount: quote.inputAmount,
        bic: ibanData.bic,
        iban: ibanData.iban,
        name: userProfile.name
      });
      return { depositQrCode: ibanCode, ibanPaymentData, stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
    } catch (error) {
      if (error instanceof Error && error.message.includes(MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND)) {
        throw new APIError({
          message: MoneriumErrors.USER_MINT_ADDRESS_NOT_FOUND,
          status: httpStatus.BAD_REQUEST
        });
      }
      throw error;
    }
  }

  private async prepareMoneriumOfframpTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata> }> {
    if (!additionalData || additionalData.walletAddress === undefined || !additionalData.moneriumAuthToken) {
      throw new APIError({
        message: "Parameters walletAddress and moneriumAuthToken is required for Monerium onramp",
        status: httpStatus.BAD_REQUEST
      });
    }
    const { unsignedTxs, stateMeta } = await prepareMoneriumEvmOfframpTransactions({
      moneriumAuthToken: additionalData.moneriumAuthToken,
      quote,
      userAddress: additionalData.walletAddress
    });
    return { stateMeta: stateMeta as Partial<StateMetadata>, unsignedTxs };
  }

  private async prepareRampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[]
  ): Promise<{
    unsignedTxs: UnsignedTx[];
    stateMeta: Partial<StateMetadata>;
    depositQrCode?: string;
    aveniaTicketId?: string;
    ibanPaymentData?: IbanPaymentData;
  }> {
    if (quote.rampType === RampDirection.SELL) {
      if (quote.outputCurrency === FiatToken.BRL) {
        return this.prepareOfframpBrlTransactions(quote, normalizedSigningAccounts, additionalData);
        // If the property moneriumAuthToken is not provided, we assume this is a regular Stellar offramp.
        // otherwise, it is automatically assumed to be a Monerium offramp.
        // FIXME change to a better check once Mykobo support is dropped, or a better way to check if the transaction is a Monerium offramp arises.
      } else if (!additionalData?.moneriumAuthToken) {
        return this.prepareOfframpNonBrlTransactions(quote, normalizedSigningAccounts, additionalData);
      } else {
        return this.prepareMoneriumOfframpTransactions(quote, normalizedSigningAccounts, additionalData);
      }
    } else {
      if (quote.inputCurrency === FiatToken.EURC) {
        return this.prepareMoneriumOnrampTransactions(quote, normalizedSigningAccounts, additionalData);
      }
      return this.prepareOnrampTransactionsMethod(quote, normalizedSigningAccounts, additionalData, signingAccounts);
    }
  }

  /**
   * Register a new ramping process. This will create a new ramp state and create transactions that need to be signed
   * on the client side.
   */
  public async registerRamp(request: RegisterRampRequest, _route = "/v1/ramp/register"): Promise<RampProcess> {
    return this.withTransaction(async transaction => {
      const { signingAccounts, quoteId, additionalData } = request;

      const quote = await QuoteTicket.findByPk(quoteId, { transaction });

      if (!quote) {
        throw new APIError({
          message: QuoteError.QuoteNotFound,
          status: httpStatus.NOT_FOUND
        });
      }

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

      // Validate sessionId if both quote and request have it
      const requestSessionId = additionalData?.sessionId;
      const quoteSessionId = quote.metadata.sessionId;

      if (requestSessionId && quoteSessionId && requestSessionId !== quoteSessionId) {
        throw new APIError({
          message: `SessionId mismatch. Quote has sessionId '${quoteSessionId}' but request provided '${requestSessionId}'`,
          status: httpStatus.BAD_REQUEST
        });
      }

      const normalizedSigningAccounts = normalizeAndValidateSigningAccounts(signingAccounts);

      const { unsignedTxs, stateMeta, depositQrCode, ibanPaymentData, aveniaTicketId } = await this.prepareRampTransactions(
        quote,
        normalizedSigningAccounts,
        additionalData,
        signingAccounts
      );

      await this.consumeQuote(quote.id, transaction);

      // Create initial ramp state
      const rampState = await this.createRampState({
        currentPhase: "initial" as RampPhase,
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
          ibanPaymentData,
          inputAmount: quote.inputAmount,
          inputCurrency: quote.inputCurrency,
          outputAmount: quote.outputAmount,
          outputCurrency: quote.outputCurrency,
          ...request.additionalData,
          ...stateMeta
        } as StateMetadata,
        to: quote.to,
        type: quote.rampType,
        unsignedTxs
      });

      const response: RegisterRampResponse = {
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        depositQrCode: rampState.state.depositQrCode,
        from: rampState.from,
        ibanPaymentData: rampState.state.ibanPaymentData,
        id: rampState.id,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: rampState.unsignedTxs,
        updatedAt: rampState.updatedAt.toISOString()
      };

      console.log("Triggering TRANSACTION_CREATED webhook for ramp state:", rampState.id);
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

      // Check if the ramp is in a state that allows updates
      if (rampState.currentPhase !== "initial") {
        throw new APIError({
          message: "Ramp is not in a state that allows updates",
          status: httpStatus.CONFLICT
        });
      }

      // Validate presigned transactions, if some were supplied
      if (presignedTxs && presignedTxs.length > 0) {
        validatePresignedTxs(presignedTxs);
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

      // Create response
      const response: UpdateRampResponse = {
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        depositQrCode: rampState.state.depositQrCode,
        from: rampState.from,
        ibanPaymentData: rampState.state.ibanPaymentData,
        id: rampState.id,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: rampState.unsignedTxs, // Use current time since we just updated
        updatedAt: new Date().toISOString()
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

      // Check if presigned transactions are available (should be set by updateRamp)
      if (!rampState.presignedTxs || rampState.presignedTxs.length === 0) {
        throw new APIError({
          message: "No presigned transactions found. Please call updateRamp first.",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Validate presigned transactions
      validatePresignedTxs(rampState.presignedTxs);

      const rampStateCreationTime = new Date(rampState.createdAt);
      const currentTime = new Date();
      const timeDifferenceSeconds = (currentTime.getTime() - rampStateCreationTime.getTime()) / 1000;

      // We leave 20% of the time window for to reach the stellar creation operation.
      if (timeDifferenceSeconds > SEQUENCE_TIME_WINDOW_IN_SECONDS * 0.8) {
        this.cancelRamp(rampState.id);
        throw new APIError({
          message: "Maximum time window to start process exceeded. Ramp invalidated.",
          status: httpStatus.BAD_REQUEST
        });
      }

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch(error => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });

      // Create response
      const response: StartRampResponse = {
        createdAt: rampState.createdAt.toISOString(),
        currentPhase: rampState.currentPhase,
        from: rampState.from,
        id: rampState.id,
        paymentMethod: rampState.paymentMethod,
        quoteId: rampState.quoteId,
        to: rampState.to,
        type: rampState.type,
        unsignedTxs: rampState.unsignedTxs,
        updatedAt: rampState.updatedAt.toISOString()
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

    // Fetch associated quote for fee data
    const quote = await QuoteTicket.findByPk(rampState.quoteId);

    if (!quote) {
      throw new APIError({
        message: "Associated quote not found",
        status: httpStatus.NOT_FOUND
      });
    }

    // Calculate processing fees
    const processingFeeFiat = new Big(quote.fee.anchor).plus(quote.fee.vortex).toFixed();
    const processingFeeUsd = new Big(quote.metadata.usdFeeStructure.anchor)
      .plus(quote.metadata.usdFeeStructure.vortex)
      .toFixed();

    const response: GetRampStatusResponse = {
      anchorFeeFiat: quote.fee.anchor,
      anchorFeeUsd: quote.metadata.usdFeeStructure.anchor,
      createdAt: rampState.createdAt.toISOString(),
      currentPhase: rampState.currentPhase,
      depositQrCode: rampState.state.depositQrCode,
      feeCurrency: quote.fee.currency,
      from: rampState.from,
      ibanPaymentData: rampState.state.ibanPaymentData,
      id: rampState.id,
      inputAmount: quote.inputAmount,
      networkFeeFiat: quote.fee.network,
      networkFeeUsd: quote.metadata.usdFeeStructure.network,
      outputAmount: quote.outputAmount,
      partnerFeeFiat: quote.fee.partnerMarkup,
      partnerFeeUsd: quote.metadata.usdFeeStructure.partnerMarkup,
      paymentMethod: rampState.paymentMethod,
      processingFeeFiat,
      processingFeeUsd,
      quoteId: rampState.quoteId,
      sessionId: rampState.state.sessionId,
      status: this.mapPhaseToStatus(rampState.currentPhase),
      to: rampState.to,
      totalFeeFiat: quote.fee.total,
      totalFeeUsd: quote.metadata.usdFeeStructure.total,
      type: rampState.type,
      updatedAt: rampState.updatedAt.toISOString(),
      vortexFeeFiat: quote.fee.vortex,
      vortexFeeUsd: quote.metadata.usdFeeStructure.vortex,
      walletAddress: rampState.state.walletAddress,
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

    return rampState.errorLogs;
  }

  /**
   * Get ramp history for a wallet address
   */
  public async getRampHistory(walletAddress: string): Promise<GetRampHistoryResponse> {
    const rampStates = await RampState.findAll({
      order: [["createdAt", "DESC"]],
      where: {
        [Op.or]: [{ "state.walletAddress": walletAddress }, { "state.destinationAddress": walletAddress }],
        currentPhase: {
          [Op.ne]: "initial"
        }
      }
    });

    const transactions = rampStates.map(ramp => ({
      date: ramp.createdAt.toISOString(),
      fromAmount: ramp.state.inputAmount || "",
      fromCurrency: ramp.state.inputCurrency || "",
      fromNetwork: ramp.from,
      id: ramp.id,
      status: this.mapPhaseToStatus(ramp.currentPhase),
      toAmount: ramp.state.outputAmount || "",
      toCurrency: ramp.state.outputCurrency || "",
      toNetwork: ramp.to,
      type: ramp.type
    }));

    return { transactions };
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

    // Limit the number of error logs to 100
    const updatedErrorLogs = [...(rampState.errorLogs || []), errorLog].slice(-100);
    await rampState.update({
      errorLogs: updatedErrorLogs
    });
  }

  private async cancelRamp(id: string): Promise<void> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      throw new Error("Ramp not found.");
    }

    await this.updateRampState(id, {
      currentPhase: "timedOut"
    });
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

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      throw new APIError({
        message: "Subaccount not found",
        status: httpStatus.BAD_REQUEST
      });
    }
    const subAccountData = await brlaApiService.subaccountInfo(taxIdRecord.subAccountId);
    const subaccountLimits = await brlaApiService.getSubaccountUsedLimit(taxIdRecord.subAccountId);
    if (!subaccountLimits) {
      throw new APIError({
        message: "Failed to fetch subaccount limits",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // To make it harder to extract information, both the pixKey and the receiverTaxId are required to be correct.
    try {
      const pixKeyData = await brlaApiService.validatePixKey(pixKey);
      //validate the recipient's taxId with partial information
      if (!validateMaskedNumber(pixKeyData.taxId, receiverTaxId)) {
        throw new APIError({
          message: "Invalid pixKey or receiverTaxId.",
          status: httpStatus.BAD_REQUEST
        });
      }
    } catch (_error) {
      throw new APIError({
        message: "Invalid pixKey or receiverTaxId.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const brlLimits = subaccountLimits.limitInfo.limits.find(limit => limit.currency === BrlaCurrency.BRL);
    if (!brlLimits) {
      throw new APIError({
        message: "BRL limits not found.",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    if (Number(amount) > Number(brlLimits.maxFiatOut) - Number(brlLimits.usedLimit.usedFiatOut)) {
      throw new APIError({
        message: "Amount exceeds limit.",
        status: httpStatus.BAD_REQUEST
      });
    }

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
    amount: string,
    moonbeamEphemeralAddress: string
  ): Promise<{ brCode: string; aveniaTicketId: string }> {
    const brlaApiService = BrlaApiService.getInstance();

    const taxIdRecord = await TaxId.findByPk(taxId);
    if (!taxIdRecord) {
      throw new APIError({
        message: "Subaccount not found.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const accountLimits = await brlaApiService.getSubaccountUsedLimit(taxIdRecord.subAccountId);
    // Filter for BRL specific limits
    const brlaLimits = accountLimits?.limitInfo.limits.filter(entry => entry.currency === BrlaCurrency.BRL);
    if (!brlaLimits || brlaLimits.length === 0) {
      throw new APIError({
        message: "BRL limits not found.",
        status: httpStatus.BAD_REQUEST
      });
    }
    const { maxFiatIn, usedLimit } = brlaLimits[0] || {};

    if (Number(amount) > Number(maxFiatIn) - Number(usedLimit.usedFiatIn)) {
      throw new APIError({
        message: "Amount exceeds KYC limits.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const aveniaQuote = await brlaApiService.createPayInQuote({
      inputAmount: String(amount),
      inputCurrency: BrlaCurrency.BRL,
      inputPaymentMethod: AveniaPaymentMethod.PIX,
      inputThirdParty: false,
      outputCurrency: BrlaCurrency.BRLA,
      outputPaymentMethod: AveniaPaymentMethod.MOONBEAM,
      outputThirdParty: false,
      subAccountId: taxIdRecord.subAccountId
    });
    const aveniaTicket = await brlaApiService.createPixInputTicket(
      {
        quoteToken: aveniaQuote.quoteToken,
        ticketBlockchainOutput: {
          walletAddress: moonbeamEphemeralAddress,
          walletChain: AveniaPaymentMethod.MOONBEAM
        },
        ticketBrlPixInput: {
          additionalData: generateReferenceLabel(quote)
        }
      },
      taxIdRecord.subAccountId
    );

    return { aveniaTicketId: aveniaTicket.id, brCode: aveniaTicket.brCode };
  }

  private mapPhaseToWebhookStatus(phase: RampPhase): TransactionStatus {
    if (phase === "complete") return TransactionStatus.COMPLETE;
    if (phase === "failed" || phase === "timedOut") return TransactionStatus.FAILED;
    return TransactionStatus.PENDING;
  }

  private async notifyStatusChangeIfNeeded(rampState: RampState, oldPhase: RampPhase, newPhase: RampPhase): Promise<void> {
    const oldStatus = this.mapPhaseToWebhookStatus(oldPhase);
    const newStatus = this.mapPhaseToWebhookStatus(newPhase);

    if (oldStatus !== newStatus) {
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

    const oldPhase = rampState.currentPhase;

    await super.logPhaseTransition(id, newPhase, metadata);

    if (oldPhase !== newPhase) {
      await this.notifyStatusChangeIfNeeded(rampState, oldPhase, newPhase);
    }
  }
}

export default new RampService();
