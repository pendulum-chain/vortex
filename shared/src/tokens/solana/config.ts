import {TokenType} from '../types/base';
import {Networks} from '../../helpers';
import {SolanaToken, SolanaTokenDetails} from "../types/solana";

export const solanaTokenConfig: Partial<Record<Networks, Record<SolanaToken, SolanaTokenDetails>>> = {
  [Networks.Solana]: {
    [SolanaToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      networkAssetIcon: 'solanaUSDC',
      decimals: 6,
      network: Networks.Solana,
      type: TokenType.Solana,
    },
  },
};
