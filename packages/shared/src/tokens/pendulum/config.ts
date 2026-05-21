/**
 * Pendulum-specific constants for token configuration
 */

import { AssetHubToken, FiatToken } from "../types/base";
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
  currency: AssetHubToken.USDC,
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

// Stellar-backed EURC representative on Pendulum.
// Nabla pool (Pendulum EVM) for EURC: 0xE14e56f442C2d452E201214069aCB3cfD51Ad3F8
export const PENDULUM_EURC_STELLAR: PendulumTokenDetails = {
  assetSymbol: "EURC",
  currency: FiatToken.EURC,
  currencyId: {
    Stellar: {
      AlphaNum4: {
        code: "0x45555243",
        issuer: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136"
      }
    }
  },
  decimals: 12,
  erc20WrapperAddress: "6eNUvRWCKE3kejoyrJTXiSM7NxtWi37eRXTnKhGKPsJevAj5"
};
