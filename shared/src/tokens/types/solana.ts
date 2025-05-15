import {BaseTokenDetails, TokenType} from './base';
import {Networks} from '../../helpers';

export enum SolanaToken {
  USDC = 'usdc',
}

export interface SolanaTokenDetails extends BaseTokenDetails {
  type: TokenType.Solana;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  erc20AddressSourceChain: string
}
