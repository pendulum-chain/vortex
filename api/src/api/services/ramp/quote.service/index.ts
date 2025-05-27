import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import httpStatus from 'http-status';
import { EvmToken, QuoteEndpoints, RampCurrency, OnChainToken, FiatToken, DestinationType } from 'shared';
import { BaseRampService } from '../base.service';
import QuoteTicket, { QuoteTicketMetadata } from '../../../../models/quoteTicket.model';
import Partner from '../../../../models/partner.model';
import logger from '../../../../config/logger';
import { APIError } from '../../../errors/api-error';
import { priceFeedService } from '../../priceFeed.service';
import { calculateFeeComponents, calculatePreNablaDeductibleFees } from './quote-fees';
import { calculateNablaSwapOutput, calculateEvmBridgeAndNetworkFee } from './gross-output';
import { trimTrailingZeros, validateChainSupport, getTargetFiatCurrency } from './helpers';

export class QuoteService extends BaseRampService {
  public async createQuote(request: QuoteEndpoints.CreateQuoteRequest): Promise<QuoteEndpoints.QuoteResponse> {
    // a. Initial Setup
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

    // Determine the target fiat currency for fees
    const targetFeeFiatCurrency = getTargetFiatCurrency(
      request.rampType,
      request.inputCurrency,
      request.outputCurrency,
    );

    // b. Calculate Pre-Nabla Deductible Fees
    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      request.inputAmount,
      request.inputCurrency,
      request.outputCurrency,
      request.rampType,
      request.from,
      request.to,
      request.partnerId,
    );

    // c. Calculate inputAmountForNablaSwap
    // Convert preNablaDeductibleFeeAmount from feeCurrency to request.inputCurrency
    const preNablaDeductibleFeeInInputCurrency = await priceFeedService.convertCurrency(
      preNablaDeductibleFeeAmount.toString(),
      feeCurrency,
      request.inputCurrency,
    );

    const inputAmountForNablaSwap = new Big(request.inputAmount).minus(preNablaDeductibleFeeInInputCurrency);

    // Ensure inputAmountForNablaSwap is not negative
    if (inputAmountForNablaSwap.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover pre-Nabla deductible fees',
      });
    }

    // d. Perform Nabla Swap
    // Determine nablaOutputCurrency based on ramp type and destination
    let nablaOutputCurrency: RampCurrency;
    let toPolkadotDestination: DestinationType;

    if (request.rampType === 'on') {
      // On-Ramp: intermediate currency on Pendulum/Moonbeam
      if (request.to === 'assethub') {
        nablaOutputCurrency = request.outputCurrency; // Direct to target OnChainToken
        toPolkadotDestination = 'assethub';
      } else {
        nablaOutputCurrency = EvmToken.USDC; // Use USDC as intermediate for EVM destinations
        toPolkadotDestination = 'moonbeam';
      }
    } else {
      // Off-Ramp: fiat-representative token on Pendulum
      if (request.to === 'pix') {
        nablaOutputCurrency = FiatToken.BRL; // BRLA wrapper for BRL
      } else if (request.to === 'sepa') {
        nablaOutputCurrency = FiatToken.EURC; // wrapped EURC for EUR
      } else if (request.to === 'cbu') {
        nablaOutputCurrency = FiatToken.ARS; // wrapped ARS
      } else {
        throw new APIError({
          status: httpStatus.BAD_REQUEST,
          message: `Unsupported off-ramp destination: ${request.to}`,
        });
      }
      toPolkadotDestination = 'pendulum';
    }

    const nablaSwapResult = await calculateNablaSwapOutput({
      inputAmountForSwap: inputAmountForNablaSwap.toString(),
      inputCurrency: request.inputCurrency,
      nablaOutputCurrency,
      rampType: request.rampType,
      fromPolkadotDestination:
        request.rampType === 'on' ? request.from : request.from === 'assethub' ? 'assethub' : 'moonbeam',
      toPolkadotDestination,
    });

    // Store outputAmountMoonbeamRaw for metadata
    const outputAmountMoonbeamRaw = nablaSwapResult.nablaOutputAmountRaw;

    // e. Handle EVM Bridge/Swap (If On-Ramp to EVM non-AssetHub)
    let finalGrossOutputAmountDecimal = nablaSwapResult.nablaOutputAmountDecimal;
    let squidrouterNetworkFeeUSD = '0';
    let effectiveExchangeRate = nablaSwapResult.effectiveExchangeRate;

    if (request.rampType === 'on' && request.to !== 'assethub') {
      const evmBridgeResult = await calculateEvmBridgeAndNetworkFee({
        intermediateAmountRaw: nablaSwapResult.nablaOutputAmountRaw,
        intermediateCurrencyOnEvm: EvmToken.USDC as OnChainToken,
        finalOutputCurrency: request.outputCurrency as OnChainToken,
        finalEvmDestination: request.to,
        originalInputAmountForRateCalc: inputAmountForNablaSwap.toString(),
      });

      finalGrossOutputAmountDecimal = new Big(evmBridgeResult.finalGrossOutputAmountDecimal);
      squidrouterNetworkFeeUSD = evmBridgeResult.networkFeeUSD;
      if (evmBridgeResult.finalEffectiveExchangeRate) {
        effectiveExchangeRate = evmBridgeResult.finalEffectiveExchangeRate;
      }
    }

    // f. Calculate Full Fee Breakdown
    const grossOutputAmountForFeeCalc =
      request.rampType === 'on'
        ? finalGrossOutputAmountDecimal.toString()
        : nablaSwapResult.nablaOutputAmountDecimal.toString();

    const {
      vortexFee,
      anchorFee,
      partnerMarkupFee,
      feeCurrency: calculatedFeeCurrency,
    } = await calculateFeeComponents({
      inputAmount: request.inputAmount,
      outputAmount: grossOutputAmountForFeeCalc,
      rampType: request.rampType,
      from: request.from,
      to: request.to,
      partnerName: request.partnerId,
      inputCurrency: request.inputCurrency,
      outputCurrency: request.outputCurrency,
    });

    // g. Aggregate and Finalize Fees
    // Convert squidrouterNetworkFeeUSD to targetFeeFiatCurrency
    const usdCurrency = EvmToken.USDC;
    const squidrouterNetworkFeeFiat = await priceFeedService.convertCurrency(
      squidrouterNetworkFeeUSD,
      usdCurrency,
      targetFeeFiatCurrency,
    );

    // Network fee is only the Squidrouter fee for now
    const networkFeeFiatForTotal = squidrouterNetworkFeeFiat;

    // Convert other fees to targetFeeFiatCurrency if needed
    let vortexFeeFiat = vortexFee;
    let anchorFeeFiat = anchorFee;
    let partnerMarkupFeeFiat = partnerMarkupFee;

    if (calculatedFeeCurrency !== targetFeeFiatCurrency) {
      vortexFeeFiat = await priceFeedService.convertCurrency(vortexFee, calculatedFeeCurrency, targetFeeFiatCurrency);
      anchorFeeFiat = await priceFeedService.convertCurrency(anchorFee, calculatedFeeCurrency, targetFeeFiatCurrency);
      partnerMarkupFeeFiat = await priceFeedService.convertCurrency(
        partnerMarkupFee,
        calculatedFeeCurrency,
        targetFeeFiatCurrency,
      );
    }

    // Calculate total fee in fiat
    const totalFeeFiat = new Big(networkFeeFiatForTotal)
      .plus(vortexFeeFiat)
      .plus(anchorFeeFiat)
      .plus(partnerMarkupFeeFiat)
      .toFixed(2);

    // USD Fee Structure for metadata
    const vortexFeeUsd = await priceFeedService.convertCurrency(vortexFeeFiat, targetFeeFiatCurrency, usdCurrency);
    const anchorFeeUsd = await priceFeedService.convertCurrency(anchorFeeFiat, targetFeeFiatCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await priceFeedService.convertCurrency(
      partnerMarkupFeeFiat,
      targetFeeFiatCurrency,
      usdCurrency,
    );

    // Network fee is only the Squidrouter fee for now
    const totalNetworkFeeUsd = squidrouterNetworkFeeUSD;
    const totalFeeUsd = new Big(totalNetworkFeeUsd)
      .plus(vortexFeeUsd)
      .plus(anchorFeeUsd)
      .plus(partnerMarkupFeeUsd)
      .toFixed(6);

    // h. Calculate Final Net Output Amount
    let finalNetOutputAmount: Big;

    if (request.rampType === 'on') {
      // Convert totalFeeFiat to output currency
      const totalFeeInOutputCurrency = await priceFeedService.convertCurrency(
        // We already deducted pre-Nabla fees in the earlier calculations, so we add them back here so we don't double-deduct
        new Big(totalFeeFiat).minus(preNablaDeductibleFeeAmount).toString(),
        targetFeeFiatCurrency,
        request.outputCurrency,
      );
      finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputCurrency);
    } else {
      // For off-ramp, convert totalFeeFiat to the fiat-representative currency amount
      const totalFeeInOutputFiat = await priceFeedService.convertCurrency(
        // We already deducted pre-Nabla fees in the earlier calculations, so we add them back here so we don't double-deduct
        new Big(totalFeeFiat).minus(preNablaDeductibleFeeAmount).toString(),
        targetFeeFiatCurrency,
        request.outputCurrency,
      );
      finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputFiat);
    }

    // Validate final output amount
    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Input amount too low to cover calculated fees',
      });
    }

    // Format final output amount
    const finalNetOutputAmountStr =
      request.rampType === 'on' ? finalNetOutputAmount.toFixed(6, 0) : finalNetOutputAmount.toFixed(2, 0);

    // i. Store and Return Quote
    const feeToStore: QuoteEndpoints.FeeStructure = {
      network: networkFeeFiatForTotal,
      vortex: vortexFeeFiat,
      anchor: anchorFeeFiat,
      partnerMarkup: partnerMarkupFeeFiat,
      total: totalFeeFiat,
      currency: targetFeeFiatCurrency,
    };

    const usdFeeStructure = {
      network: totalNetworkFeeUsd,
      vortex: vortexFeeUsd,
      anchor: anchorFeeUsd,
      partnerMarkup: partnerMarkupFeeUsd,
      total: totalFeeUsd,
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
      outputAmount: finalNetOutputAmountStr,
      outputCurrency: request.outputCurrency,
      fee: feeToStore,
      partnerId: partner?.id || null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      status: 'pending',
      metadata: {
        onrampOutputAmountMoonbeamRaw: outputAmountMoonbeamRaw,
        onrampInputAmountUnits: inputAmountForNablaSwap.toString(),
        grossOutputAmount: finalGrossOutputAmountDecimal.toString(),
        usdFeeStructure,
        effectiveExchangeRate,
      } as QuoteTicketMetadata,
    });

    // Format and return the response
    const responseFeeStructure: QuoteEndpoints.FeeStructure = {
      network: trimTrailingZeros(networkFeeFiatForTotal),
      vortex: trimTrailingZeros(vortexFeeFiat),
      anchor: trimTrailingZeros(anchorFeeFiat),
      partnerMarkup: trimTrailingZeros(partnerMarkupFeeFiat),
      total: trimTrailingZeros(totalFeeFiat),
      currency: targetFeeFiatCurrency,
    };

    return {
      id: quote.id,
      rampType: quote.rampType,
      from: quote.from,
      to: quote.to,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(finalNetOutputAmountStr),
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
