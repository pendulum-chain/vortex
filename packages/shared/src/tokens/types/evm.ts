/**
 * EVM token types
 */

import { EvmAddress, PendulumTokenDetails } from "../..";
import { Networks } from "../../helpers";
import { BaseTokenDetails, TokenType } from "./base";

export enum EvmToken {
  AXLUSDC = "axlUSDC",
  USDC = "USDC",
  USDT = "USDT",
  USDCE = "USDC.E",
  ETH = "ETH"
}

export enum UsdLikeEvmToken {
  USDC = EvmToken.USDC,
  USDT = EvmToken.USDT,
  USDCE = EvmToken.USDCE
}

export interface EvmTokenDetails extends BaseTokenDetails {
  type: TokenType.Evm;
  assetSymbol: string;
  networkAssetIcon: string;
  network: Networks;
  erc20AddressSourceChain: EvmAddress;
  isNative: boolean;
  /// The metadata about the token when it's used in Pendulum.
  /// For now, all EVM tokens are represented by axlUSDC on Pendulum.
  pendulumRepresentative: PendulumTokenDetails;
}

export interface EvmTokenDetailsWithBalance extends EvmTokenDetails {
  balance: string;
}
