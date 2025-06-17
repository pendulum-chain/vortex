import {
  AccountMeta,
  FiatToken,
  GetRampHistoryResponse,
  GetRampStatusResponse,
  Networks,
  RampErrorLog,
  RampPhase,
  RampProcess,
  RegisterRampRequest,
  RegisterRampResponse,
  StartRampRequest,
  StartRampResponse,
  UnsignedTx,
  UpdateRampRequest,
  UpdateRampResponse,
  validateMaskedNumber
} from "@packages/shared";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../../config/logger";
import { SEQUENCE_TIME_WINDOW_IN_SECONDS } from "../../../constants/constants";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { APIError } from "../../errors/api-error";
import { BrlaApiService } from "../brla/brlaApiService";
import { generateReferenceLabel } from "../brla/helpers";
import { SubaccountData } from "../brla/types";
import { StateMetadata } from "../phases/meta-state-types";
import phaseProcessor from "../phases/phase-processor";
import { validatePresignedTxs } from "../transactions";
import { prepareOfframpTransactions } from "../transactions/offrampTransactions";
import { prepareOnrampTransactions } from "../transactions/onrampTransactions";
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
      network,
      address: account.address
    });
  });

  return normalizedAccounts;
}

export class RampService extends BaseRampService {
  private async prepareOfframpBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; brCode?: string }> {
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
      quote,
      signingAccounts: normalizedSigningAccounts,
      stellarPaymentData: additionalData.paymentData,
      userAddress: additionalData.walletAddress,
      pixDestination: additionalData.pixDestination,
      taxId: additionalData.taxId,
      receiverTaxId: additionalData.receiverTaxId,
      brlaEvmAddress: subaccount.wallets.evm
    });

    const brCode = await this.validateBrlaOnrampRequest(additionalData.taxId, quote, quote.inputAmount);

    return { unsignedTxs, stateMeta, brCode };
  }

  private async prepareOfframpNonBrlTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; brCode?: string }> {
    const { unsignedTxs, stateMeta } = await prepareOfframpTransactions({
      quote,
      signingAccounts: normalizedSigningAccounts,
      stellarPaymentData: additionalData?.paymentData,
      userAddress: additionalData?.walletAddress
    });

    return { unsignedTxs, stateMeta, brCode: undefined };
  }

  private async prepareOnrampTransactionsMethod(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; brCode?: string }> {
    if (!additionalData || additionalData.destinationAddress === undefined || additionalData.taxId === undefined) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: "Parameters destinationAddress and taxId are required for onramp"
      });
    }

    const moonbeamEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Moonbeam);
    if (!moonbeamEphemeralEntry) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: "Moonbeam ephemeral not found"
      });
    }

    const brCode = await this.validateBrlaOnrampRequest(additionalData.taxId, quote, quote.inputAmount);

    const { unsignedTxs, stateMeta } = await prepareOnrampTransactions(
      quote,
      normalizedSigningAccounts,
      additionalData.destinationAddress,
      additionalData.taxId
    );

    return { unsignedTxs, stateMeta: stateMeta as Partial<StateMetadata>, brCode };
  }

  private async prepareRampTransactions(
    quote: QuoteTicket,
    normalizedSigningAccounts: AccountMeta[],
    additionalData: RegisterRampRequest["additionalData"],
    signingAccounts: AccountMeta[]
  ): Promise<{ unsignedTxs: UnsignedTx[]; stateMeta: Partial<StateMetadata>; brCode?: string }> {
    if (quote.rampType === "off") {
      if (quote.outputCurrency === FiatToken.BRL) {
        return this.prepareOfframpBrlTransactions(quote, normalizedSigningAccounts, additionalData);
      } else {
        return this.prepareOfframpNonBrlTransactions(quote, normalizedSigningAccounts, additionalData);
      }
    } else {
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
          status: httpStatus.NOT_FOUND,
          message: "Quote not found"
        });
      }

      if (quote.status !== "pending") {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Quote is ${quote.status}`
        });
      }

      if (new Date(quote.expiresAt) < new Date()) {
        await quote.update({ status: "expired" }, { transaction });

        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: "Quote has expired"
        });
      }

      const normalizedSigningAccounts = normalizeAndValidateSigningAccounts(signingAccounts);

      const { unsignedTxs, stateMeta, brCode } = await this.prepareRampTransactions(
        quote,
        normalizedSigningAccounts,
        additionalData,
        signingAccounts
      );

      await this.consumeQuote(quote.id, transaction);

      // Create initial ramp state
      const rampState = await this.createRampState({
        type: quote.rampType,
        currentPhase: "initial" as RampPhase,
        unsignedTxs,
        presignedTxs: null,
        from: quote.from,
        to: quote.to,
        state: {
          inputAmount: quote.inputAmount,
          inputCurrency: quote.inputCurrency,
          outputAmount: quote.outputAmount,
          outputCurrency: quote.outputCurrency,
          brCode,
          ...request.additionalData,
          ...stateMeta
        } as StateMetadata,
        processingLock: { locked: false, lockedAt: null },
        postCompleteState: {
          cleanup: { cleanupCompleted: false, cleanupAt: null, errors: null }
        },
        quoteId: quote.id
      });

      const response: RegisterRampResponse = {
        id: rampState.id,
        quoteId: rampState.quoteId,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        unsignedTxs: rampState.unsignedTxs,
        from: rampState.from,
        to: rampState.to,
        createdAt: rampState.createdAt.toISOString(),
        updatedAt: rampState.updatedAt.toISOString(),
        brCode: rampState.state.brCode
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
          status: httpStatus.NOT_FOUND,
          message: "Ramp not found"
        });
      }

      // Check if the ramp is in a state that allows updates
      if (rampState.currentPhase !== "initial") {
        throw new APIError({
          status: httpStatus.CONFLICT,
          message: "Ramp is not in a state that allows updates"
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
        id: rampState.id,
        quoteId: rampState.quoteId,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        unsignedTxs: rampState.unsignedTxs,
        from: rampState.from,
        to: rampState.to,
        createdAt: rampState.createdAt.toISOString(),
        updatedAt: new Date().toISOString(), // Use current time since we just updated
        brCode: rampState.state.brCode
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
          status: httpStatus.NOT_FOUND,
          message: "Ramp not found"
        });
      }

      // Check if presigned transactions are available (should be set by updateRamp)
      if (!rampState.presignedTxs || rampState.presignedTxs.length === 0) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: "No presigned transactions found. Please call updateRamp first."
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
          status: httpStatus.BAD_REQUEST,
          message: "Maximum time window to start process exceeded. Ramp invalidated."
        });
      }

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch(error => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });

      // Create response
      const response: StartRampResponse = {
        id: rampState.id,
        quoteId: rampState.quoteId,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        from: rampState.from,
        to: rampState.to,
        unsignedTxs: rampState.unsignedTxs,
        createdAt: rampState.createdAt.toISOString(),
        updatedAt: rampState.updatedAt.toISOString()
      };

      return response;
    });
  }

  /**
   * Get the status of a ramping process
   */
  public async getRampStatus(id: string): Promise<GetRampStatusResponse | null> {
    const rampState = await this.getRampState(id);

    if (!rampState) {
      return null;
    }

    return {
      id: rampState.id,
      quoteId: rampState.quoteId,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      unsignedTxs: rampState.unsignedTxs,
      from: rampState.from,
      to: rampState.to,
      createdAt: rampState.createdAt.toISOString(),
      updatedAt: rampState.updatedAt.toISOString()
    };
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
      where: {
        [Op.or]: [{ "state.walletAddress": walletAddress }, { "state.destinationAddress": walletAddress }],
        currentPhase: {
          [Op.ne]: "initial"
        }
      },
      order: [["createdAt", "DESC"]]
    });

    const transactions = rampStates.map(ramp => ({
      id: ramp.id,
      type: ramp.type,
      fromNetwork: ramp.from,
      toNetwork: ramp.to,
      fromAmount: ramp.state.inputAmount || "",
      toAmount: ramp.state.outputAmount || "",
      fromCurrency: ramp.state.inputCurrency || "",
      toCurrency: ramp.state.outputCurrency || "",
      status: this.mapPhaseToStatus(ramp.currentPhase),
      date: ramp.createdAt.toISOString()
    }));

    return { transactions };
  }

  /**
   * Map ramp phase to a user-friendly status
   */
  private mapPhaseToStatus(phase: RampPhase): string {
    if (phase === "complete") return "success";
    if (phase === "failed" || phase === "timedOut") return "failed";
    return "pending";
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
        status: httpStatus.NOT_FOUND,
        message: "Ramp not found"
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
  ): Promise<SubaccountData> {
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Subaccount not found.`
      });
    }

    // To make it harder to extract information, both the pixKey and the receiverTaxId are required to be correct.
    try {
      const pixKeyData = await brlaApiService.validatePixKey(pixKey);

      //validate the recipient's taxId with partial information
      if (!validateMaskedNumber(pixKeyData.taxId, receiverTaxId)) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Invalid pixKey or receiverTaxId.`
        });
      }
    } catch (_error) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Invalid pixKey or receiverTaxId.`
      });
    }

    const limitBurn = subaccount.kyc.limits.limitBurn;

    if (Number(amount) > limitBurn) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Amount exceeds limit.`
      });
    }

    return subaccount;
  }

  /**
   * BRLA. Validate the onramp request. Returns appropiate pay in code if valid.
   */
  public async validateBrlaOnrampRequest(taxId: string, quote: QuoteTicket, amount: string): Promise<string> {
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);
    if (!subaccount) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Subaccount not found.`
      });
    }

    if (subaccount.kyc.level < 1) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `KYC invalid.`
      });
    }

    const { limitMint } = subaccount.kyc.limits;

    if (Number(amount) > limitMint) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Amount exceeds KYC limits.`
      });
    }

    const brCode = await brlaApiService.generateBrCode({
      subaccountId: subaccount.id,
      amount: String(amount),
      referenceLabel: generateReferenceLabel(quote)
    });

    return brCode.brCode;
  }
}

export default new RampService();
