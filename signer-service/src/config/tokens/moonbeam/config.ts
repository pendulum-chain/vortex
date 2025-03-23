/**
 * Moonbeam token configuration
 */

import { FiatToken, TokenType } from '../types/base';
import { MoonbeamTokenDetails } from '../types/moonbeam';
import { PENDULUM_BRLA_MOONBEAM } from '../constants/pendulum';

export const moonbeamTokenConfig: Record<FiatToken, MoonbeamTokenDetails> = {
  [FiatToken.BRL]: {
    type: TokenType.Moonbeam,
    assetSymbol: 'BRL',
    partnerUrl: 'https://brla.digital',
    decimals: 18,
    fiat: {
      assetIcon: 'brl',
      symbol: 'BRL',
      name: 'Brazilian Real',
    },
    polygonErc20Address: '0xe6a537a407488807f0bbeb0038b79004f19dddfb',
    moonbeamErc20Address: '0xfeb25f3fddad13f82c4d6dbc1481516f62236429',
    minWithdrawalAmountRaw: '3000000000000000000', // 3 BRL.
    maxWithdrawalAmountRaw: '10000000000000000000000', // 10,000 BRL. Maximum value for a KYC level 1 user.
    offrampFeesBasisPoints: 0,
    offrampFeesFixedComponent: 0.75, // 0.75 BRL
    ...PENDULUM_BRLA_MOONBEAM,
  },
  [FiatToken.EURC]: {
    type: TokenType.Moonbeam,
    assetSymbol: 'EURC',
    partnerUrl: 'https://placeholder.com', // Placeholder, update with actual URL
    decimals: 18,
    fiat: {
      assetIcon: 'eur',
      symbol: 'EUR',
      name: 'Euro',
    },
    polygonErc20Address: '0x0000000000000000000000000000000000000000', // Placeholder, update with actual address
    moonbeamErc20Address: '0x0000000000000000000000000000000000000000', // Placeholder, update with actual address
    minWithdrawalAmountRaw: '3000000000000000000', // Placeholder, update with actual value
    maxWithdrawalAmountRaw: '10000000000000000000000', // Placeholder, update with actual value
    offrampFeesBasisPoints: 0, // Placeholder, update with actual value
    offrampFeesFixedComponent: 0.75, // Placeholder, update with actual value
    ...PENDULUM_BRLA_MOONBEAM, // Placeholder, update with actual value
  },
  [FiatToken.ARS]: {
    type: TokenType.Moonbeam,
    assetSymbol: 'ARS',
    partnerUrl: 'https://placeholder.com', // Placeholder, update with actual URL
    decimals: 18,
    fiat: {
      assetIcon: 'ars',
      symbol: 'ARS',
      name: 'Argentine Peso',
    },
    polygonErc20Address: '0x0000000000000000000000000000000000000000', // Placeholder, update with actual address
    moonbeamErc20Address: '0x0000000000000000000000000000000000000000', // Placeholder, update with actual address
    minWithdrawalAmountRaw: '3000000000000000000', // Placeholder, update with actual value
    maxWithdrawalAmountRaw: '10000000000000000000000', // Placeholder, update with actual value
    offrampFeesBasisPoints: 0, // Placeholder, update with actual value
    offrampFeesFixedComponent: 0.75, // Placeholder, update with actual value
    ...PENDULUM_BRLA_MOONBEAM, // Placeholder, update with actual value
  },
};
