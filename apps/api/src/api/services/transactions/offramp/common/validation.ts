import {
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
  Networks
} from "@packages/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

/**
 * Validates offramp quote and returns required data
 * @param quote The quote ticket
 * @param signingAccounts The signing accounts
 * @returns Validation result with required data
 */
export function validateOfframpQuote(quote: QuoteTicketAttributes, signingAccounts: any[]) {
  const fromNetwork = getNetworkFromDestination(quote.from);
  if (!fromNetwork) {
    throw new Error(`Invalid network for destination ${quote.from}`);
  }

  if (!isOnChainToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }

  const inputTokenDetails = getOnChainTokenDetails(fromNetwork, quote.inputCurrency);
  if (!inputTokenDetails) {
    throw new Error(`Input currency must be on-chain token for offramp, got ${quote.inputCurrency}`);
  }

  if (!isFiatToken(quote.outputCurrency)) {
    throw new Error(`Output currency must be fiat token for offramp, got ${quote.outputCurrency}`);
  }

  const outputTokenDetails = getAnyFiatTokenDetails(quote.outputCurrency);

  const stellarEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Stellar);
  if (!stellarEphemeralEntry) {
    throw new Error("Stellar ephemeral not found");
  }

  const pendulumEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.network === Networks.Pendulum);
  if (!pendulumEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  return {
    fromNetwork,
    inputTokenDetails,
    outputTokenDetails,
    pendulumEphemeralEntry,
    stellarEphemeralEntry
  };
}

/**
 * Validates BRL offramp requirements
 * @param quote The quote ticket
 * @param params Offramp parameters
 */
export function validateBRLOfframp(
  quote: QuoteTicketAttributes,
  params: {
    brlaEvmAddress?: string;
    pixDestination?: string;
    taxId?: string;
    receiverTaxId?: string;
  }
) {
  const { brlaEvmAddress, pixDestination, taxId, receiverTaxId } = params;

  if (!brlaEvmAddress || !pixDestination || !taxId || !receiverTaxId) {
    throw new Error("brlaEvmAddress, pixDestination, receiverTaxId and taxId parameters must be provided for offramp to BRL");
  }

  if (!quote.metadata.pendulumToMoonbeamXcm) {
    throw new Error("Quote metadata is missing pendulumToMoonbeamXcm information");
  }
}

/**
 * Validates Stellar offramp requirements
 * @param outputTokenDetails Output token details
 * @param stellarPaymentData Stellar payment data
 */
export function validateStellarOfframp(outputTokenDetails: any, stellarPaymentData?: any) {
  if (!isStellarOutputTokenDetails(outputTokenDetails)) {
    throw new Error(`Output currency must be Stellar token for offramp, got output token details type`);
  }

  if (!stellarPaymentData?.anchorTargetAccount) {
    throw new Error("Stellar payment data must be provided for offramp");
  }
}

/**
 * Validates Stellar offramp metadata
 * @param quote The quote ticket
 */
export function validateStellarOfframpMetadata(quote: QuoteTicketAttributes) {
  if (!quote.metadata.pendulumToStellar) {
    throw new Error("Quote metadata is missing pendulumToStellar information");
  }
}
