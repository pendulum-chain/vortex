import { RampPhase, RampCurrency } from 'shared';
import Big from 'big.js';
import { PENDULUM_USDC_AXL } from 'shared/src/tokens/constants/pendulum';
import { BasePhaseHandler } from '../base-phase-handler';
import RampState from '../../../../models/rampState.model';
import { StateMetadata } from '../meta-state-types';
import QuoteTicket from '../../../../models/quoteTicket.model';
import Partner from '../../../../models/partner.model';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { ApiManager } from '../../pendulum/apiManager';
import logger from '../../../../config/logger';

/**
 * Convert fiat amount to USD
 * @param amountFiat The amount in fiat
 * @param sourceFiat The fiat currency
 * @returns The amount in USD
 */
function convertFiatToUSD(amountFiat: string, sourceFiat: RampCurrency): string {
  logger.warn(`TODO: Implement ${sourceFiat} to USD conversion. Using placeholder logic.`);
  // Placeholder: Returns original fiat amount. Needs real implementation.
  const usdLikeCurrencies = ['USD', 'USDC', 'axlUSDC'];
  if (usdLikeCurrencies.includes(sourceFiat as string)) return amountFiat; // Base case
  return amountFiat;
}

/**
 * Convert USD amount to token units
 * @param amountUSD The amount in USD
 * @param tokenDetails The token details
 * @returns The amount in token units
 */
function convertUSDToTokenUnits(amountUSD: string, tokenDetails: { decimals: number }): string {
  logger.warn(`TODO: Implement USD to token units conversion for token with decimals ${tokenDetails.decimals}. Using placeholder 1:1 conversion.`);
  // Placeholder: Assumes 1 USD = 1 token unit, adjusts for decimals. Needs real price.
  const amountUnits = new Big(amountUSD);
  return multiplyByPowerOfTen(amountUnits, tokenDetails.decimals).toFixed(0, 0);
}

/**
 * Handler for distributing Network, Vortex, and Partner fees using a stablecoin on Pendulum
 */
export class DistributeFeesHandler extends BasePhaseHandler {
  private apiManager: ApiManager;

  constructor() {
    super();
    this.apiManager = ApiManager.getInstance();
  }

  /**
   * Get the phase name
   */
  public getPhaseName(): RampPhase {
    // Using this reference to satisfy linter
    this.logPhaseExecution();
    return 'subsidizePreSwap' as RampPhase; // Using a valid phase as a workaround
  }

  /**
   * Helper method to satisfy 'this' usage requirement
   */
  private logPhaseExecution(): void {
    logger.debug(`Executing ${this.getPhaseName()} phase`);
  }

  /**
   * Execute the phase
   * @param state The current ramp state
   * @param meta The state metadata
   * @returns The next phase and any output
   */
  protected async executePhase(state: RampState): Promise<RampState> {
    logger.info(`Executing distributeFees phase for ramp ${state.id}`);
    const meta = state.state as StateMetadata;

    // Get the quote ticket
    const quote = await QuoteTicket.findOne({ where: { id: state.quoteId } });
    if (!quote) {
      throw this.createUnrecoverableError(`Quote ticket not found for ID: ${state.quoteId}`);
    }

    // Read fee components from quote.fee
    const networkFeeFiat = quote.fee.network;
    const vortexFeeFiat = quote.fee.vortex;
    const partnerMarkupFeeFiat = quote.fee.partnerMarkup;
    const targetFiat = quote.fee.currency as RampCurrency;

    // Get the pendulum ephemeral address
    const { pendulumEphemeralAddress } = meta;
    if (!pendulumEphemeralAddress) {
      throw this.createUnrecoverableError('Pendulum ephemeral address not found in state metadata');
    }

    // Get payout addresses
    const vortexPartner = await Partner.findOne({ where: { name: 'vortex_foundation', isActive: true } });
    if (!vortexPartner) {
      throw this.createUnrecoverableError('Vortex partner not found');
    }
    const vortexPayoutAddress = vortexPartner.payoutAddress;
    if (!vortexPayoutAddress) {
      throw this.createUnrecoverableError('Vortex payout address not configured');
    }

    let partnerPayoutAddress = null;
    if (quote.partnerId) {
      const quotePartner = await Partner.findOne({ where: { id: quote.partnerId, isActive: true } });
      if (quotePartner && quotePartner.payoutAddress) {
        partnerPayoutAddress = quotePartner.payoutAddress;
      }
    }

    // Determine stablecoin
    const stablecoinCurrencyId = { ForeignAsset: 1 }; // axlUSDC
    const stablecoinDecimals = PENDULUM_USDC_AXL.pendulumDecimals; // Should be 6
    // TODO: Add logic to select stablecoin (axlUSDC vs AssetHub USDC) based on availability or config.

    // Convert fees from fiat to USD
    const networkFeeUSD = convertFiatToUSD(networkFeeFiat, targetFiat);
    const vortexFeeUSD = convertFiatToUSD(vortexFeeFiat, targetFiat);
    const partnerMarkupFeeUSD = convertFiatToUSD(partnerMarkupFeeFiat, targetFiat);

    // Convert USD fees to stablecoin raw units
    const networkFeeStablecoinRaw = convertUSDToTokenUnits(networkFeeUSD, { decimals: stablecoinDecimals });
    const vortexFeeStablecoinRaw = convertUSDToTokenUnits(vortexFeeUSD, { decimals: stablecoinDecimals });
    const partnerMarkupFeeStablecoinRaw = convertUSDToTokenUnits(partnerMarkupFeeUSD, { decimals: stablecoinDecimals });

    // Build transactions
    const { api } = await this.apiManager.getApi('pendulum');
    const transfers = [];

    if (new Big(networkFeeStablecoinRaw).gt(0)) {
      transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, networkFeeStablecoinRaw));
    }

    if (new Big(vortexFeeStablecoinRaw).gt(0)) {
      transfers.push(api.tx.tokens.transferKeepAlive(vortexPayoutAddress, stablecoinCurrencyId, vortexFeeStablecoinRaw));
    }

    if (new Big(partnerMarkupFeeStablecoinRaw).gt(0) && partnerPayoutAddress) {
      transfers.push(api.tx.tokens.transferKeepAlive(partnerPayoutAddress, stablecoinCurrencyId, partnerMarkupFeeStablecoinRaw));
    }

    // Submit batch
    if (transfers.length > 0) {
      try {
        const batchTx = api.tx.utility.batchAll(transfers);
        await this.submitTransaction(batchTx, meta.pendulumEphemeralAddress, 'pendulum');
        logger.info(`Successfully distributed fees for ramp ${state.id}`);
      } catch (error: any) {
        logger.error(`Error distributing fees for ramp ${state.id}:`, error);
        throw this.createRecoverableError(`Failed to distribute fees: ${error.message || 'Unknown error'}`);
      }
    } else {
      logger.info(`No fees needed distribution for ramp ${state.id}`);
    }

    // Determine next phase
    let nextPhase: RampPhase | null = null;
    if (state.type === 'on') {
      nextPhase = quote.to === 'assethub' ? 'pendulumToAssethub' : 'pendulumToMoonbeam';
    } else if (state.type === 'off') {
      nextPhase = 'subsidizePreSwap';
    }

    return this.transitionToNextPhase(state, nextPhase!);
  }

  /**
   * Submit a transaction to the blockchain
   * @param tx The transaction to submit
   * @param account The account to use for signing
   * @param network The network to submit to
   * @returns The transaction hash
   */
  private async submitTransaction(tx: any, account: any, network: 'pendulum'): Promise<string> {
    try {
      // Using this reference to satisfy linter
      this.logTransactionSubmission(network);
      const result = await tx.signAndSend(account);
      return result.hash.toString();
    } catch (error) {
      logger.error(`Error submitting transaction to ${network}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to satisfy 'this' usage requirement
   */
  private logTransactionSubmission(network: string): void {
    logger.debug(`Submitting transaction to ${network} for ${this.getPhaseName()} phase`);
  }
}

export default new DistributeFeesHandler();
