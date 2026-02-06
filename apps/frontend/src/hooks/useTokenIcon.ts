import {
  FiatTokenDetails,
  getOnChainTokenDetails,
  isAssetHubTokenDetails,
  isEvmTokenDetails,
  isFiatToken,
  isFiatTokenDetails,
  Networks,
  OnChainToken,
  OnChainTokenDetails,
  TokenDetails
} from "@vortexfi/shared";
import { useMemo } from "react";
import { getEvmTokenConfig } from "../services/tokens";
import { useGetAssetIcon } from "./useGetAssetIcon";

export interface TokenIconInfo {
  iconSrc: string;
  fallbackIconSrc?: string;
  network?: Networks;
}

/**
 * Get logo URIs from on-chain token details.
 * Supports both EVM tokens (with fallbackLogoURI) and AssetHub tokens.
 */
function getTokenLogoURIs(token: OnChainTokenDetails): { logoURI?: string; fallbackLogoURI?: string } {
  if (isEvmTokenDetails(token)) {
    return { fallbackLogoURI: token.fallbackLogoURI, logoURI: token.logoURI };
  }
  if (isAssetHubTokenDetails(token)) {
    return { logoURI: token.logoURI };
  }
  return {};
}

/**
 * Hook to get token icon information for any currency (fiat or on-chain).
 *
 * Supports multiple input patterns:
 * 1. Currency string + optional network
 * 2. OnChainTokenDetails object
 * 3. FiatTokenDetails object
 *
 * @example
 * // Currency string (fiat)
 * const { iconSrc } = useTokenIcon("EUR");
 *
 * // Currency string with network (on-chain)
 * const { iconSrc, fallbackIconSrc, network } = useTokenIcon("USDC", Networks.Polygon);
 *
 * // OnChainTokenDetails object
 * const { iconSrc, fallbackIconSrc, network } = useTokenIcon(evmTokenDetails);
 *
 * // FiatTokenDetails object
 * const { iconSrc } = useTokenIcon(fiatTokenDetails);
 */
export function useTokenIcon(tokenDetails: OnChainTokenDetails): TokenIconInfo;
export function useTokenIcon(tokenDetails: FiatTokenDetails): TokenIconInfo;
export function useTokenIcon(tokenDetails: TokenDetails): TokenIconInfo;
export function useTokenIcon(currency: string, network?: Networks): TokenIconInfo;
export function useTokenIcon(currencyOrDetails: string | TokenDetails, network?: Networks): TokenIconInfo {
  // Extract currency string for fiat icon lookup (used as fallback)
  const currencyForFiatLookup = useMemo(() => {
    if (typeof currencyOrDetails === "string") {
      return currencyOrDetails.toLowerCase();
    }
    // For token details, use assetSymbol
    return currencyOrDetails.assetSymbol.toLowerCase();
  }, [currencyOrDetails]);

  const fiatIcon = useGetAssetIcon(currencyForFiatLookup);

  return useMemo(() => {
    // Handle token details objects
    if (typeof currencyOrDetails !== "string") {
      // FiatTokenDetails (Stellar or Moonbeam)
      if (isFiatTokenDetails(currencyOrDetails)) {
        return {
          iconSrc: fiatIcon
        };
      }

      // OnChainTokenDetails (EVM or AssetHub)
      const { logoURI, fallbackLogoURI } = getTokenLogoURIs(currencyOrDetails as OnChainTokenDetails);
      return {
        fallbackIconSrc: fallbackLogoURI,
        iconSrc: logoURI ?? fiatIcon,
        network: currencyOrDetails.network
      };
    }

    // Handle currency string input
    const currency = currencyOrDetails;

    // Fiat tokens use local icons
    if (isFiatToken(currency)) {
      return {
        iconSrc: fiatIcon
      };
    }

    // On-chain tokens need to look up details for logoURI
    if (network) {
      const tokenDetails = getOnChainTokenDetails(network, currency as OnChainToken, getEvmTokenConfig());
      if (tokenDetails) {
        const { logoURI, fallbackLogoURI } = getTokenLogoURIs(tokenDetails);
        return {
          fallbackIconSrc: fallbackLogoURI,
          iconSrc: logoURI ?? fiatIcon,
          network
        };
      }
    }

    // Fallback to fiat icon lookup (will return placeholder if not found)
    return {
      iconSrc: fiatIcon,
      network
    };
  }, [currencyOrDetails, network, fiatIcon]);
}
