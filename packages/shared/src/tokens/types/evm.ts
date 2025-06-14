/**
 * EVM token types
 */

import { Networks } from '../../helpers';
import { BaseTokenDetails, PendulumDetails, TokenType } from './base';

export enum EvmToken {
  USDC = 'usdc',
  USDT = 'usdt',
  USDCE = 'usdce',
}

export enum UsdLikeEvmToken {
  USDC = EvmToken.USDC,
  USDT = EvmToken.USDT,
  USDCE = EvmToken.USDCE,
}

export interface EvmTokenDetails extends BaseTokenDetails, PendulumDetails {
  type: TokenType.Evm;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  erc20AddressSourceChain: `0x${string}`;
}

export interface EvmTokenDetailsWithBalance extends EvmTokenDetails {
  balance: string;
}
