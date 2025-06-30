/**
 * Pendulum-specific constants for token configuration
 */

import { FiatToken } from "../types/base";
import { EvmToken } from "../types/evm";
import { PendulumTokenDetails } from "../types/pendulum";

export const PENDULUM_USDC_AXL: PendulumTokenDetails = {
  assetSymbol: "USDC.axl",
  currency: EvmToken.USDC,
  currencyId: { XCM: 12 },
  decimals: 6,
  erc20WrapperAddress: "6eMCHeByJ3m2yPsXFkezBfCQtMs3ymUPqtAyCA41mNWmbNJe"
};

export const PENDULUM_USDC_ASSETHUB: PendulumTokenDetails & {
  foreignAssetId: number;
} = {
  assetSymbol: "USDC",
  currency: EvmToken.USDC,
  currencyId: { XCM: 2 },
  decimals: 6, // USDC on AssetHub
  erc20WrapperAddress: "6dAegKXwGWEXkfhNbeqeKothqhe6G81McRxG8zvaDYrpdVHF",
  foreignAssetId: 1337
};

export const PENDULUM_BRLA_MOONBEAM: PendulumTokenDetails = {
  assetSymbol: "BRLA",
  currency: FiatToken.BRL,
  currencyId: { XCM: 13 },
  decimals: 18,
  erc20WrapperAddress: "6eRq1yvty6KorGcJ3nKpNYrCBn9FQnzsBhFn4JmAFqWUwpnh"
};

export const AXL_USDC_MOONBEAM = "0xca01a1d0993565291051daff390892518acfad3a";
export const MOONBEAM_XCM_FEE_GLMR = "50000000000000000";
