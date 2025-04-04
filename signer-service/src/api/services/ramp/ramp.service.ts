import httpStatus from 'http-status';
import {
  AccountMeta,
  FiatToken,
  Networks,
  RampEndpoints,
  RampErrorLog,
  RampPhase,
  UnsignedTx,
  validateMaskedNumber,
} from 'shared';
import { BaseRampService } from './base.service';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import phaseProcessor from '../phases/phase-processor';
import { validatePresignedTxs } from '../transactions';
import { prepareOnrampTransactions } from '../transactions/onrampTransactions';
import { prepareOfframpTransactions } from '../transactions/offrampTransactions';
import { SubaccountData } from '../brla/types';
import { BrlaApiService } from '../brla/brlaApiService';

export function normalizeAndValidateSigningAccounts(accounts: AccountMeta[]): AccountMeta[] {
  const normalizedAccounts: AccountMeta[] = [];
  const allowedNetworks = new Set(Object.values(Networks).map((network) => network.toLowerCase()));

  accounts.forEach((account) => {
    if (!allowedNetworks.has(account.network.toLowerCase())) {
      throw new Error(`Invalid network: "${account.network}" provided.`);
    }
    normalizedAccounts.push({
      network: Object.values(Networks).find((network) => network.toLowerCase() === account.network.toLowerCase())!, // We know it exists given the check above
      address: account.address,
    });
  });

  return normalizedAccounts;
}

export class RampService extends BaseRampService {
  /**
   * Register a new ramping process. This will create a new ramp state and create transactions that need to be signed
   * on the client side.
   */
  public async registerRamp(
    request: RampEndpoints.RegisterRampRequest,
    route = '/v1/ramp/register',
  ): Promise<RampEndpoints.RegisterRampResponse> {
    return this.withTransaction(async (transaction) => {
      const { signingAccounts, quoteId, additionalData } = request;

      // Get and validate the quote
      const quote = await QuoteTicket.findByPk(quoteId, { transaction });

      if (!quote) {
        throw new APIError({
          status: httpStatus.NOT_FOUND,
          message: 'Quote not found',
        });
      }

      if (quote.status !== 'pending') {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Quote is ${quote.status}`,
        });
      }

      if (new Date(quote.expiresAt) < new Date()) {
        // Update the quote status to expired
        await quote.update({ status: 'expired' }, { transaction });

        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Quote has expired',
        });
      }

      // Normalize to lower case the networks entry of signingAccounts, and compare with allowed ones.
      const normalizedSigningAccounts = normalizeAndValidateSigningAccounts(signingAccounts);

      // Create to-be-signed transactions
      let unsignedTxs: UnsignedTx[] = [];
      let stateMeta: any = {};
      if (quote.rampType === 'off') {
        if (quote.outputCurrency === FiatToken.BRL) {
          if (
            !additionalData ||
            !additionalData.pixDestination ||
            !additionalData.taxId ||
            !additionalData.receiverTaxId
          ) {
            throw new Error('receiverTaxId, pixDestination and taxId parameters must be provided for offramp to BRL');
          }
          // Validate BRLA off-ramp request
          const subaccount = await this.validateBrlaOfframpRequest(
            additionalData.taxId,
            additionalData.pixDestination,
            additionalData.receiverTaxId,
            quote.outputAmount,
          );

          ({ unsignedTxs, stateMeta } = await prepareOfframpTransactions({
            quote,
            signingAccounts: normalizedSigningAccounts,
            stellarPaymentData: additionalData.paymentData,
            userAddress: additionalData.walletAddress,
            pixDestination: additionalData.pixDestination,
            taxId: additionalData.taxId,
            receiverTaxId: additionalData.receiverTaxId,
            brlaEvmAddress: subaccount.wallets.evm,
          }));
        } else {
          ({ unsignedTxs, stateMeta } = await prepareOfframpTransactions({
            quote,
            signingAccounts: normalizedSigningAccounts,
            stellarPaymentData: additionalData?.paymentData,
            userAddress: additionalData?.walletAddress,
          }));
        }
      } else {
        // validate we have the destination address
        if (!additionalData || additionalData.destinationAddress === undefined || additionalData.taxId === undefined) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: 'Parameters destinationAddress and taxId are required for onramp',
          });
        }
        ({ unsignedTxs, stateMeta } = await prepareOnrampTransactions(
          quote,
          normalizedSigningAccounts,
          additionalData?.destinationAddress,
          additionalData?.taxId,
        ));
      }

      // Mark the quote as consumed
      await this.consumeQuote(quote.id, transaction);

      // Create initial state data
      const stateData = {
        type: quote.rampType,
        currentPhase: 'initial' as RampPhase,
        unsignedTxs,
        presignedTxs: null, // There are no presigned transactions at this point
        from: quote.from,
        to: quote.to,
        state: {
          inputAmount: quote.inputAmount,
          inputCurrency: quote.inputCurrency,
          outputAmount: quote.outputAmount,
          outputCurrency: quote.outputCurrency,
          ...request.additionalData,
          ...stateMeta,
        },
        quoteId: quote.id,
      };

      // Create the ramp state
      const rampState = await this.createRampState(stateData);

      // Create response
      const response: RampEndpoints.RegisterRampResponse = {
        id: rampState.id,
        quoteId: rampState.quoteId,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        unsignedTxs: rampState.unsignedTxs,
        from: rampState.from,
        to: rampState.to,
        createdAt: rampState.createdAt.toISOString(),
        updatedAt: rampState.updatedAt.toISOString(),
      };

      return response;
    });
  }

  /**
   * Start a new ramping process. This will kick off the ramping process with the presigned transactions provided.
   */
  public async startRamp(
    request: RampEndpoints.StartRampRequest,
    route = '/v1/ramp/start',
  ): Promise<RampEndpoints.StartRampResponse> {
    return this.withTransaction(async (transaction) => {
      const rampState = await RampState.findByPk(request.rampId, {
        transaction,
      });

      if (!rampState) {
        throw new APIError({
          status: httpStatus.NOT_FOUND,
          message: 'Ramp not found',
        });
      }

      // Validate presigned transactions
      validatePresignedTxs(request.presignedTxs);

      // TODO check if the ramp has required state in additional data
      // Offramps starting on Assethub need to have the assetHubToPendulumHash
      // Offramps starting on an EVM network need to have the squidRouterApproveHash and squidRouterSwapHash
      // Onramps might need other checks.
      const { squidRouterApproveHash, squidRouterSwapHash, assetHubToPendulumHash } = request.additionalData!

      await this.updateRampState(request.rampId, {
        presignedTxs: request.presignedTxs,
      });
      // TODO add or check expiry of rampState as well?

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch((error) => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });

      // Create response
      const response: RampEndpoints.StartRampResponse = {
        id: rampState.id,
        quoteId: rampState.quoteId,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        from: rampState.from,
        to: rampState.to,
        unsignedTxs: rampState.unsignedTxs,
        createdAt: rampState.createdAt.toISOString(),
        updatedAt: rampState.updatedAt.toISOString(),
      };

      return response;
    });
  }

  /**
   * Get the status of a ramping process
   */
  public async getRampStatus(id: string): Promise<RampEndpoints.GetRampStatusResponse | null> {
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
      updatedAt: rampState.updatedAt.toISOString(),
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
   * BRLA. Get subaccount and validate pix and tax id.
   */
  public async validateBrlaOfframpRequest(
    taxId: string,
    pixKey: string,
    receiverTaxId: string,
    amount: string,
  ): Promise<SubaccountData> {
    const brlaApiService = BrlaApiService.getInstance();
    const subaccount = await brlaApiService.getSubaccount(taxId);

    if (!subaccount) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Subaccount not found.`,
      });
    }

    // To make it harder to extract information, both the pixKey and the receiverTaxId are required to be correct.
    try {
      const pixKeyData = await brlaApiService.validatePixKey(pixKey);

      //validate the recipient's taxId with partial information
      if (!validateMaskedNumber(pixKeyData.taxId, receiverTaxId)) {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Invalid pixKey or receiverTaxId.`,
        });
      }
    } catch (error) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Invalid pixKey or receiverTaxId.`,
      });
    }

    const limitBurn = subaccount.kyc.limits.limitBurn;

    if (Number(amount) > limitBurn) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: `Amount exceeds limit.`,
      });
    }

    return subaccount;
  }
}

export default new RampService();
