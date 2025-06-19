/**
 * EVM token types
 */

import { EvmAddress } from "../..";
import { Networks } from "../../helpers";
import { BaseTokenDetails, PendulumDetails, TokenType } from "./base";

export enum EvmToken {
  USDC = "usdc",
  USDT = "usdt",
  USDCE = "usdce",
  ETH = "eth"
}

export enum UsdLikeEvmToken {
  USDC = EvmToken.USDC,
  USDT = EvmToken.USDT,
  USDCE = EvmToken.USDCE
}

export interface EvmTokenDetails extends BaseTokenDetails, PendulumDetails {
  type: TokenType.Evm;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  erc20AddressSourceChain: EvmAddress;
}

export interface EvmTokenDetailsWithBalance extends EvmTokenDetails {
  balance: string;
}
