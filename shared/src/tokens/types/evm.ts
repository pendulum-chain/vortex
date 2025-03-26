/**
 * EVM token types
 */

import { BaseTokenDetails, PendulumDetails, TokenType } from './base';
import { Networks } from '../../helpers';

export enum EvmToken {
  USDC = 'usdc',
  USDT = 'usdt',
  USDCE = 'usdce',
}

export interface EvmTokenDetails extends BaseTokenDetails, PendulumDetails {
  type: TokenType.Evm;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  erc20AddressSourceChain: `0x${string}`;
}
