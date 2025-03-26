/**
 * Pendulum-specific constants for token configuration
 */

import { PendulumDetails } from '../types/base';

export const PENDULUM_USDC_AXL: PendulumDetails = {
  pendulumErc20WrapperAddress: '6eMCHeByJ3m2yPsXFkezBfCQtMs3ymUPqtAyCA41mNWmbNJe',
  pendulumCurrencyId: { XCM: 12 },
  pendulumAssetSymbol: 'USDC.axl',
  pendulumDecimals: 6,
};

export const PENDULUM_USDC_ASSETHUB: PendulumDetails & { foreignAssetId: number } = {
  pendulumErc20WrapperAddress: '6dAegKXwGWEXkfhNbeqeKothqhe6G81McRxG8zvaDYrpdVHF',
  pendulumCurrencyId: { XCM: 2 },
  foreignAssetId: 1337, // USDC on AssetHub
  pendulumAssetSymbol: 'USDC',
  pendulumDecimals: 6,
};

export const PENDULUM_BRLA_MOONBEAM: PendulumDetails = {
  pendulumErc20WrapperAddress: '6eRq1yvty6KorGcJ3nKpNYrCBn9FQnzsBhFn4JmAFqWUwpnh',
  pendulumCurrencyId: { XCM: 13 },
  pendulumAssetSymbol: 'BRLA',
  pendulumDecimals: 18,
};

export const AXL_USDC_MOONBEAM = '0xca01a1d0993565291051daff390892518acfad3a';
export const MOONBEAM_XCM_FEE_GLMR = '50000000000000000';
