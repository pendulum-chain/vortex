import {
  AccountMeta,
  EphemeralAccountType,
  EvmNetworks,
  EvmToken,
  evmTokenConfig,
  FiatToken,
  getAnyFiatTokenDetails,
  getEvmTokenConfig,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getOnChainTokenDetailsOrDefault,
  isFiatToken,
  isMoonbeamTokenDetails,
  isNetworkEVM,
  isOnChainToken,
  isOnChainTokenDetails,
  MoonbeamTokenDetails,
  Networks,
  OnChainTokenDetails
} from "@vortexfi/shared";
import { QuoteTicketAttributes } from "../../../../../models/quoteTicket.model";

const resolveToNetwork = (quote: QuoteTicketAttributes): Networks => {
  const toNetwork = getNetworkFromDestination(quote.to);
  if (!toNetwork) throw new Error(`Invalid network for destination ${quote.to}`);
  return toNetwork;
};

const resolveOutputOnChainTokenDetails = (toNetwork: Networks, quote: QuoteTicketAttributes): OnChainTokenDetails => {
  if (!isOnChainToken(quote.outputCurrency)) {
    throw new Error(`Output currency cannot be fiat token ${quote.outputCurrency} for onramp.`);
  }
  const details = getOnChainTokenDetails(toNetwork, quote.outputCurrency);
  if (!details || !isOnChainTokenDetails(details)) {
    throw new Error(`Output token must be on-chain token for onramp, got ${quote.outputCurrency}`);
  }
  return details;
};

const requireEphemeral = (accounts: AccountMeta[], type: EphemeralAccountType, label: string): AccountMeta => {
  const found = accounts.find(a => a.type === type);
  if (!found) throw new Error(`${label} ephemeral not found`);
  return found;
};

export function validateAveniaOnramp(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: Networks;
  outputTokenDetails: OnChainTokenDetails;
  substrateEphemeralEntry: AccountMeta;
  evmEphemeralEntry: AccountMeta;
  inputTokenDetails: MoonbeamTokenDetails;
} {
  const toNetwork = resolveToNetwork(quote);
  const substrateEphemeralEntry = requireEphemeral(signingAccounts, EphemeralAccountType.Substrate, "Pendulum");
  const evmEphemeralEntry = requireEphemeral(signingAccounts, EphemeralAccountType.EVM, "Moonbeam");

  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }
  const inputTokenDetails = getAnyFiatTokenDetails(quote.inputCurrency);
  if (!isMoonbeamTokenDetails(inputTokenDetails)) {
    throw new Error(`Input token must be Moonbeam token for onramp, got ${quote.inputCurrency}`);
  }

  const outputTokenDetails = resolveOutputOnChainTokenDetails(toNetwork, quote);
  return { evmEphemeralEntry, inputTokenDetails, outputTokenDetails, substrateEphemeralEntry, toNetwork };
}

export function validateAveniaOnrampOnBase(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: Networks;
  outputTokenDetails: OnChainTokenDetails;
  evmEphemeralEntry: AccountMeta;
  inputTokenDetails: OnChainTokenDetails;
} {
  const toNetwork = resolveToNetwork(quote);
  const evmEphemeralEntry = requireEphemeral(signingAccounts, EphemeralAccountType.EVM, "Base");

  if (!isFiatToken(quote.inputCurrency)) {
    throw new Error(`Input currency must be fiat token for onramp, got ${quote.inputCurrency}`);
  }

  // For Base, we use BRLA's native minted token
  const inputTokenDetails = getEvmTokenConfig().base[EvmToken.BRLA];
  if (!inputTokenDetails) {
    throw new Error("BRLA token details not found for Base");
  }

  const outputTokenDetails = resolveOutputOnChainTokenDetails(toNetwork, quote);
  return { evmEphemeralEntry, inputTokenDetails, outputTokenDetails, toNetwork };
}

export function validateMoneriumOnramp(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: Networks;
  outputTokenDetails: OnChainTokenDetails;
  substrateEphemeralEntry: AccountMeta;
  evmEphemeralEntry: AccountMeta;
} {
  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }
  const toNetwork = resolveToNetwork(quote);
  return {
    evmEphemeralEntry: requireEphemeral(signingAccounts, EphemeralAccountType.EVM, "Polygon"),
    outputTokenDetails: resolveOutputOnChainTokenDetails(toNetwork, quote),
    substrateEphemeralEntry: requireEphemeral(signingAccounts, EphemeralAccountType.Substrate, "Pendulum"),
    toNetwork
  };
}

export function validateMykoboOnramp(
  quote: QuoteTicketAttributes,
  signingAccounts: AccountMeta[]
): {
  toNetwork: EvmNetworks;
  outputTokenDetails: OnChainTokenDetails;
  evmEphemeralEntry: AccountMeta;
  inputCurrency: FiatToken.EURC;
} {
  if (quote.inputCurrency !== FiatToken.EURC) {
    throw new Error(`Input currency must be EURC for onramp, got ${quote.inputCurrency}`);
  }
  // No substrate ephemeral: Mykobo path stays on Base and hands off to Squidrouter for the
  // destination chain. Pendulum is not in the loop.
  const toNetwork = resolveToNetwork(quote);
  if (!isNetworkEVM(toNetwork)) {
    throw new Error(`Mykobo onramp requires an EVM destination network, got ${toNetwork}`);
  }
  return {
    evmEphemeralEntry: requireEphemeral(signingAccounts, EphemeralAccountType.EVM, "Base"),
    inputCurrency: FiatToken.EURC,
    outputTokenDetails: resolveOutputOnChainTokenDetails(toNetwork, quote),
    toNetwork
  };
}
