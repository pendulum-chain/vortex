import { BaseRampService, PresignedTx, RampStateData, UnsignedTx } from './base.service';
import RampState from '../../../models/rampState.model';
import QuoteTicket from '../../../models/quoteTicket.model';
import logger from '../../../config/logger';
import { APIError } from '../../errors/api-error';
import httpStatus from 'http-status';
import phaseProcessor from '../phases/phase-processor';
import { validatePresignedTxs } from '../transactions';
import { prepareOnrampTransactions } from '../transactions/onrampTransactions';
import { prepareOfframpTransactions } from '../transactions/offrampTransactions';
import { DestinationType, Networks } from '../../helpers/networks';

export interface AccountMeta {
  network: Networks;
  address: string;
}

export interface RegisterRampRequest {
  quoteId: string;
  signingAccounts: AccountMeta[];
  additionalData?: Record<string, any>;
}

export interface StartRampRequest {
  rampId: string;
  presignedTxs: PresignedTx[];
  additionalData?: Record<string, any>;
}

export interface RegisterRampResponse {
  id: string;
  type: 'on' | 'off';
  currentPhase: string;
  from: DestinationType;
  to: DestinationType;
  state: any;
  createdAt: Date;
  updatedAt: Date;
  unsignedTxs: UnsignedTx[];
}

export function normalizeAndValidateSigningAccounts(accounts: AccountMeta[]): AccountMeta[] {
  let normalizedAccounts: AccountMeta[] = [];
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
    request: RegisterRampRequest,
    route: string = '/v1/ramp/register',
  ): Promise<RegisterRampResponse> {
    return this.withTransaction(async (transaction) => {
      const { signingAccounts, quoteId, additionalData } = request;

      // Get and validate the quote
      const quoteModel = await QuoteTicket.findByPk(quoteId, { transaction });

      if (!quoteModel) {
        throw new APIError({
          status: httpStatus.NOT_FOUND,
          message: 'Quote not found',
        });
      }

      const quote = quoteModel.dataValues;

      if (quote.status !== 'pending') {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Quote is ${quote.status}`,
        });
      }

      if (new Date(quote.expiresAt) < new Date()) {
        // Update the quote status to expired
        await quoteModel.update({ status: 'expired' }, { transaction });

        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: 'Quote has expired',
        });
      }

      // Normalize to lower case the networks entry of signingAccounts, and compare with allowed ones.
      const normalizedSigningAccounts = normalizeAndValidateSigningAccounts(signingAccounts);

      // Create to-be-signed transactions
      let unsignedTxs: UnsignedTx[] = [];
      if (quote.rampType === 'off') {
        unsignedTxs = await prepareOfframpTransactions(
          quote,
          normalizedSigningAccounts,
          additionalData?.['paymentData'],
          additionalData?.['userAddress'],
        );
      } else {
        //validate we have the destination address
        if (!additionalData || additionalData['destinationAddress'] === undefined) {
          throw new APIError({
            status: httpStatus.BAD_REQUEST,
            message: 'Destination address is required for onramp',
          });
        }
        unsignedTxs = await prepareOnrampTransactions(
          quote,
          normalizedSigningAccounts,
          additionalData['destinationAddress'],
        );
      }

      // Mark the quote as consumed
      await this.consumeQuote(quote.id, transaction);

      // Create initial state data
      const stateData: RampStateData = {
        type: quote.rampType,
        currentPhase: 'initial',
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
        },
        quoteId: quote.id,
      };

      // Create the ramp state
      const rampStateModel = await this.createRampState(stateData);
      const rampState = rampStateModel.dataValues;

      // Create response
      const response: RegisterRampResponse = {
        id: rampState.id,
        type: rampState.type,
        currentPhase: rampState.currentPhase,
        unsignedTxs: rampState.unsignedTxs,
        from: rampState.from,
        to: rampState.to,
        state: rampState.state,
        createdAt: rampState.createdAt,
        updatedAt: rampState.updatedAt,
      };

      return response;
    });
  }

  /**
   * Start a new ramping process. This will kick off the ramping process with the presigned transactions provided.
   */
  public async startRamp(request: StartRampRequest, route: string = '/v1/ramp/start'): Promise<void> {
    return this.withTransaction(async (transaction) => {
      const rampStateModel = await RampState.findByPk(request.rampId, { transaction });

      if (!rampStateModel) {
        throw new APIError({
          status: httpStatus.NOT_FOUND,
          message: 'Ramp not found',
        });
      }

      // Validate presigned transactions
      validatePresignedTxs(request.presignedTxs);

      const rampState = rampStateModel.dataValues;
      await this.updateRampState(request.rampId, { presignedTxs: request.presignedTxs });
      // TODO add or check expiry of rampState as well?

      // We don't return data for this request.
      const response = undefined;

      // Start processing the ramp asynchronously
      // We don't await this to avoid blocking the response
      phaseProcessor.processRamp(rampState.id).catch((error) => {
        logger.error(`Error processing ramp ${rampState.id}:`, error);
      });
    });
  }

  /**
   * Get the status of a ramping process
   */
  public async getRampStatus(id: string): Promise<RegisterRampResponse | null> {
    const rampStateModel = await this.getRampState(id);

    if (!rampStateModel) {
      return null;
    }

    const rampState = rampStateModel.dataValues;

    return {
      id: rampState.id,
      type: rampState.type,
      currentPhase: rampState.currentPhase,
      unsignedTxs: rampState.unsignedTxs,
      from: rampState.from,
      to: rampState.to,
      state: rampState.state,
      createdAt: rampState.createdAt,
      updatedAt: rampState.updatedAt,
    };
  }

  /**
   * Get the error logs for a ramping process
   */
  public async getErrorLogs(
    id: string,
  ): Promise<{ phase: string; timestamp: Date; error: string; details?: any }[] | null> {
    const rampState = await RampState.findByPk(id);

    if (!rampState) {
      return null;
    }

    return rampState.errorLogs;
  }
}

export default new RampService();
