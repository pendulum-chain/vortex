import {
  AccountMeta,
  FiatTokenDetails,
  getAnyFiatTokenDetails,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  isFiatToken,
  isOnChainToken,
  normalizeTaxId
} from "@vortexfi/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

/**
 * Validates offramp quote and returns required data
 * @param quote The quote ticket
 * @param signingAccounts The signing accounts
 * @param options Set `requireSubstrateEphemeral: false` for EVM-only offramp routes (e.g. Mykobo on Base)
 * @returns Validation result with required data
 */
export function validateOfframpQuote(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[],
  options: { requireSubstrateEphemeral?: boolean } = {}
) {
  const { requireSubstrateEphemeral = true } = options;
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

  const substrateEphemeralEntry = signingAccounts.find(ephemeral => ephemeral.type === "Substrate");
  if (requireSubstrateEphemeral && !substrateEphemeralEntry) {
    throw new Error("Pendulum ephemeral not found");
  }

  return {
    fromNetwork,
    inputTokenDetails,
    outputTokenDetails,
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
} {
  const { brlaEvmAddress, pixDestination, taxId, receiverTaxId } = params;

  if (!brlaEvmAddress || !pixDestination || !taxId || !receiverTaxId) {
    throw new Error("brlaEvmAddress, pixDestination, receiverTaxId and taxId parameters must be provided for offramp to BRL");
  }

  return {
    brlaEvmAddress,
    pixDestination,
    receiverTaxId,
    taxId: normalizeTaxId(taxId)
  };
}

/**
 * Validates BRL offramp metadata derived from the quote (substrate-input corridor).
 * Used by the legacy AssetHub→BRL route which transfers BRLA via XCM through Moonbeam.
 */
export function validateBRLOfframpMetadata(quote: QuoteTicketAttributes): {
  offrampAmountBeforeAnchorFeesRaw: string;
} {
  if (!quote.metadata.pendulumToMoonbeamXcm?.outputAmountRaw) {
    throw new Error("Quote metadata is missing pendulumToMoonbeamXcm.outputAmountRaw required for BRL offramp");
  }

  return {
    offrampAmountBeforeAnchorFeesRaw: quote.metadata.pendulumToMoonbeamXcm.outputAmountRaw
  };
}
