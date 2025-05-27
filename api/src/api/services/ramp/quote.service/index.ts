import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import { EvmToken, QuoteEndpoints } from 'shared';
import { BaseRampService } from '../base.service';
import QuoteTicket, { QuoteTicketMetadata } from '../../../../models/quoteTicket.model';
import Partner from '../../../../models/partner.model';
import logger from '../../../../config/logger';
import { APIError } from '../../../errors/api-error';
import { priceFeedService } from '../../priceFeed.service';
import { calculateFeeComponents } from './quote-fees';
import { calculateGrossOutputAndNetworkFee } from './gross-output';
import { trimTrailingZeros, validateChainSupport } from './helpers';

export class QuoteService extends BaseRampService {
  public async createQuote(request: QuoteEndpoints.CreateQuoteRequest): Promise<QuoteEndpoints.QuoteResponse> {
    validateChainSupport(request.rampType, request.from, request.to);

    // Fetch partner details
    let partner = null;
    if (request.partnerId) {
      partner = await Partner.findOne({
        where: {
          name: request.partnerId,
          isActive: true,
        },
      });

      // If partnerId (name) was provided but not found or not active, log a warning and proceed without a partner
      if (!partner) {
        logger.warn(`Partner with name '${request.partnerId}' not found or not active. Proceeding with default fees.`);
      }
    }

    // Calculate gross output amount and network fee
    const { grossOutputAmount, networkFeeUSD, outputAmountMoonbeamRaw, inputAmountUsedForSwap } =
      await calculateGrossOutputAndNetworkFee({
        inputAmount: request.inputAmount,
        inputCurrency: request.inputCurrency,
        outputCurrency: request.outputCurrency,
        rampType: request.rampType,
        from: request.from,
        to: request.to,
      });

    // Calculate fee components
    const {
      vortexFee: vortexFeeFiat,
      anchorFee: anchorFeeFiat,
      partnerMarkupFee: partnerMarkupFeeFiat,
      feeCurrency: calculatedFeeCurrency,
    } = await calculateFeeComponents({
      inputAmount: request.inputAmount,
      outputAmount: grossOutputAmount,
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      partnerName: request.partnerId,
      inputCurrency: request.inputCurrency,
      outputCurrency: request.outputCurrency,
    });

    // Perform fee conversions (USD to fiat, fiat to USD)
    // We can pick any USD-like stablecoin for the conversion
    const usdCurrency = EvmToken.USDC;
    // Convert fees denoted in USD to fee currency
    const networkFeeFiatPromise = priceFeedService.convertCurrency(networkFeeUSD, usdCurrency, calculatedFeeCurrency);
    // Convert fees denoted in fee currency to USD (needed for fee distribution transactions)
    const anchorFeeUsdPromise = priceFeedService.convertCurrency(anchorFeeFiat, calculatedFeeCurrency, usdCurrency);
    const vortexFeeUsdPromise = priceFeedService.convertCurrency(vortexFeeFiat, calculatedFeeCurrency, usdCurrency);
    const partnerMarkupFeeUsdPromise = priceFeedService.convertCurrency(
      partnerMarkupFeeFiat,
      calculatedFeeCurrency,
      usdCurrency,
    );

    const [networkFeeFiat, anchorFeeUsd, vortexFeeUsd, partnerMarkupFeeUsd] = await Promise.all([
      networkFeeFiatPromise,
      anchorFeeUsdPromise,
      vortexFeeUsdPromise,
      partnerMarkupFeeUsdPromise,
    ]);

    // Calculate total fee in fiat
    const totalFeeFiat = new Big(networkFeeFiat)
      .plus(vortexFeeFiat)
      .plus(partnerMarkupFeeFiat)
      .plus(anchorFeeFiat)
      .toFixed(2);

    // Calculate final output amount
    const feeInOutputCurrency = await priceFeedService.convertCurrency(
      totalFeeFiat,
      calculatedFeeCurrency,
      request.outputCurrency,
    );
    const finalOutputAmount = new Big(grossOutputAmount).minus(feeInOutputCurrency);

    // Validate final output amount
    if (finalOutputAmount.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover calculated fees',
      });
    }
    // Format final output amount to 6 decimal places for onramps, 2 for offramps
    const finalOutputAmountStr =
      request.rampType === 'on' ? finalOutputAmount.toFixed(6, 0) : finalOutputAmount.toFixed(2, 0);

    // Prepare fee structures for storage and USD tracking
    const feeToStore: QuoteEndpoints.FeeStructure = {
      network: networkFeeFiat,
      vortex: vortexFeeFiat,
      anchor: anchorFeeFiat,
      partnerMarkup: partnerMarkupFeeFiat,
      total: totalFeeFiat,
      currency: calculatedFeeCurrency,
    };

    const usdFeeStructure = {
      network: networkFeeUSD,
      vortex: vortexFeeUsd,
      anchor: anchorFeeUsd,
      partnerMarkup: partnerMarkupFeeUsd,
      total: new Big(networkFeeUSD).plus(vortexFeeUsd).plus(partnerMarkupFeeUsd).plus(anchorFeeUsd).toFixed(6),
      currency: 'USD',
    };

    // Create QuoteTicket
    const quote = await QuoteTicket.create({
      id: uuidv4(),
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmount: finalOutputAmountStr,
      outputCurrency: request.outputCurrency,
      fee: feeToStore,
      partnerId: partner?.id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      status: 'pending',
      metadata: {
        onrampOutputAmountMoonbeamRaw: outputAmountMoonbeamRaw,
        onrampInputAmountUnits: inputAmountUsedForSwap,
        grossOutputAmount, // Store the gross amount before fee deduction
        usdFeeStructure,
      } as QuoteTicketMetadata,
    });

    // Format and return the response
    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(networkFeeFiat),
      vortex: trimTrailingZeros(vortexFeeFiat),
      anchor: trimTrailingZeros(anchorFeeFiat),
      partnerMarkup: trimTrailingZeros(partnerMarkupFeeFiat),
      total: trimTrailingZeros(totalFeeFiat),
      currency: calculatedFeeCurrency,
    };

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(finalOutputAmountStr),
      outputCurrency: quote.outputCurrency,
      fee: responseFeeStructure,
      expiresAt: quote.expiresAt,
    };
  }

  public async getQuote(id: string): Promise<QuoteEndpoints.QuoteResponse | null> {
    const quote = await this.getQuoteTicket(id);

    if (!quote) {
      return null;
    }

    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(quote.fee.network),
      vortex: trimTrailingZeros(quote.fee.vortex),
      anchor: trimTrailingZeros(quote.fee.anchor),
      partnerMarkup: trimTrailingZeros(quote.fee.partnerMarkup),
      total: trimTrailingZeros(quote.fee.total),
      currency: quote.fee.currency,
    };

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(quote.outputAmount),
      outputCurrency: quote.outputCurrency,
      fee: responseFeeStructure,
      expiresAt: quote.expiresAt,
    };
  }
}

export default new QuoteService();
