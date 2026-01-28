import { isAssetHubTokenDetails, isEvmTokenDetails, OnChainTokenDetails } from "@vortexfi/shared";

interface TokenLogoURIs {
  logoURI?: string;
  fallbackLogoURI?: string;
}

export function getTokenLogoURIs(token: OnChainTokenDetails): TokenLogoURIs {
  if (isEvmTokenDetails(token)) {
    return {
      fallbackLogoURI: token.fallbackLogoURI,
      logoURI: token.logoURI
    };
  }
  if (isAssetHubTokenDetails(token)) {
    return {
      logoURI: token.logoURI
    };
  }
  return {};
}
