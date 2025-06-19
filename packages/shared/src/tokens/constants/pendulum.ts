/**
 * Pendulum-specific constants for token configuration
 */

import { PendulumDetails } from "../types/base";

export const PENDULUM_USDC_AXL: PendulumDetails = {
  pendulumAssetSymbol: "USDC.axl",
  pendulumCurrencyId: { XCM: 12 },
  pendulumDecimals: 6,
  pendulumErc20WrapperAddress: "6eMCHeByJ3m2yPsXFkezBfCQtMs3ymUPqtAyCA41mNWmbNJe"
};

export const PENDULUM_USDC_ASSETHUB: PendulumDetails & {
  foreignAssetId: number;
} = {
  foreignAssetId: 1337,
  pendulumAssetSymbol: "USDC",
  pendulumCurrencyId: { XCM: 2 }, // USDC on AssetHub
  pendulumDecimals: 6,
  pendulumErc20WrapperAddress: "6dAegKXwGWEXkfhNbeqeKothqhe6G81McRxG8zvaDYrpdVHF"
};

export const PENDULUM_BRLA_MOONBEAM: PendulumDetails = {
  pendulumAssetSymbol: "BRLA",
  pendulumCurrencyId: { XCM: 13 },
  pendulumDecimals: 18,
  pendulumErc20WrapperAddress: "6eRq1yvty6KorGcJ3nKpNYrCBn9FQnzsBhFn4JmAFqWUwpnh"
};

export const AXL_USDC_MOONBEAM = "0xca01a1d0993565291051daff390892518acfad3a";
export const MOONBEAM_XCM_FEE_GLMR = "50000000000000000";
