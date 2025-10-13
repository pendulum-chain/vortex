import {
  AccountMeta,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isFiatToken,
  isOnChainToken,
  isStellarOutputTokenDetails,
  Networks,
  PaymentData,
  StellarTokenDetails
} from "@packages/shared";
import Big from "big.js";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

/**
 * Validates offramp quote and returns required data
 * @param quote The quote ticket
 * @param signingAccounts The signing accounts
 * @returns Validation result with required data
 */
export function validateOfframpQuote(quote: QuoteTicketAttributes, signingAccounts: AccountMeta[]) {
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

  const stellarEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Stellar");
  if (!stellarEphemeralEntry) {
    throw new Error("Stellar ephemeral not found");
  }

  const substrateEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Substrate");
  if (!substrateEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  return {
    fromNetwork,
    inputTokenDetails,
    outputTokenDetails,
    stellarEphemeralEntry,
    substrateEphemeralEntry
  };
}

/**
 * Validates BRL offramp requirements
 * @param quote The quote ticket
 * @param params Offramp parameters
 * @returns Validated parameters
 */
export function validateBRLOfframp(
  quote: QuoteTicketAttributes,
  params: {
    brlaEvmAddress?: string;
    pixDestination?: string;
    taxId?: string;
    receiverTaxId?: string;
  }
): {
  brlaEvmAddress: string;
  pixDestination: string;
  taxId: string;
  receiverTaxId: string;
  offrampAmountBeforeAnchorFeesRaw: string;
} {
  const { brlaEvmAddress, pixDestination, taxId, receiverTaxId } = params;

  if (!brlaEvmAddress || !pixDestination || !taxId || !receiverTaxId) {
    throw new Error("brlaEvmAddress, pixDestination, receiverTaxId and taxId parameters must be provided for offramp to BRL");
  }

  if (!quote.metadata.pendulumToMoonbeamXcm?.outputAmountRaw) {
    throw new Error("Quote metadata is missing pendulumToMoonbeamXcm information");
  }

  return {
    brlaEvmAddress,
    offrampAmountBeforeAnchorFeesRaw: quote.metadata.pendulumToMoonbeamXcm.outputAmountRaw,
    pixDestination,
    receiverTaxId,
    taxId
  };
}

/**
 * Validates Stellar offramp requirements
 * @param outputTokenDetails Output token details
 * @param stellarPaymentData Stellar payment data
 * @returns Validated Stellar token details and payment data
 */
export function validateStellarOfframp(
  outputTokenDetails: FiatTokenDetails,
  stellarPaymentData?: PaymentData
): {
  stellarTokenDetails: StellarTokenDetails;
  stellarPaymentData: PaymentData;
} {
  if (!isStellarOutputTokenDetails(outputTokenDetails)) {
    throw new Error(`Output currency must be Stellar token for offramp, got output token details type`);
  }

  if (!stellarPaymentData?.anchorTargetAccount) {
    throw new Error("Stellar payment data must be provided for offramp");
  }

  return {
    stellarPaymentData,
    stellarTokenDetails: outputTokenDetails
  };
}

/**
 * Validates Stellar offramp metadata
 * @param quote The quote ticket
 * @returns Validated Stellar metadata
 */
export function validateStellarOfframpMetadata(quote: QuoteTicketAttributes): {
  offrampAmountBeforeAnchorFeesUnits: Big;
  offrampAmountBeforeAnchorFeesRaw: string;
} {
  if (!quote.metadata.pendulumToStellar?.outputAmountDecimal || !quote.metadata.pendulumToStellar?.outputAmountRaw) {
    throw new Error("Quote metadata is missing pendulumToStellar information");
  }

  return {
    offrampAmountBeforeAnchorFeesRaw: quote.metadata.pendulumToStellar.outputAmountRaw,
    offrampAmountBeforeAnchorFeesUnits: new Big(quote.metadata.pendulumToStellar.outputAmountDecimal)
  };
}
