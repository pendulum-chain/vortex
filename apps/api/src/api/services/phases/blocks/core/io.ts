import {
  AssetHubToken,
  type EvmNetworks,
  EvmToken,
  FiatToken,
  getOnChainTokenDetails,
  isNetworkEVM,
  Networks,
  type OnChainToken
} from "@vortexfi/shared";
import Big from "big.js";
import type { ChainBrand, FlowInputResolver, PhaseCtx, PhaseIO, TokenBrand } from "./types";

export function fiatRequestIO<Token extends FiatToken>(...tokens: Token[]): FlowInputResolver<PhaseIO<Token, "fiat">> {
  return (ctx: PhaseCtx) => {
    if (!tokens.includes(ctx.request.inputCurrency as Token)) {
      throw new Error(`Expected fiat flow input ${tokens.join("/")}, received ${ctx.request.inputCurrency}`);
    }
    const token = ctx.request.inputCurrency as Token;
    return {
      amount: new Big(ctx.request.inputAmount),
      amountRaw: ctx.request.inputAmount,
      chain: "fiat",
      token
    };
  };
}

function onChainRequestIO<Token extends OnChainToken, Chain extends Networks>(
  token: Token,
  chain: Chain
): FlowInputResolver<PhaseIO<Token, Chain>> {
  return (ctx: PhaseCtx) => {
    if (ctx.request.inputCurrency !== token || ctx.request.network !== chain) {
      throw new Error(
        `Expected on-chain flow input ${token} on ${chain}, received ${ctx.request.inputCurrency} on ${ctx.request.network}`
      );
    }
    const tokenDetails = getOnChainTokenDetails(chain, token);
    if (!tokenDetails) {
      throw new Error(`Token ${token} is not configured on ${chain}`);
    }
    const amount = new Big(ctx.request.inputAmount);
    return {
      amount,
      amountRaw: amount.mul(new Big(10).pow(tokenDetails.decimals)).toFixed(0, 0),
      chain,
      token
    };
  };
}

export function evmRequestIO<Token extends EvmToken, Chain extends EvmNetworks>(
  token: Token,
  chain: Chain
): FlowInputResolver<PhaseIO<Token, Chain>> {
  if (!isNetworkEVM(chain)) {
    throw new Error(`Network ${chain} is not EVM`);
  }
  return onChainRequestIO(token, chain);
}

export function assetHubRequestIO<Token extends AssetHubToken>(
  token: Token
): FlowInputResolver<PhaseIO<Token, typeof Networks.AssetHub>> {
  return onChainRequestIO(token, Networks.AssetHub);
}

export function evmIO<Token extends TokenBrand, Chain extends ChainBrand>(
  token: Token,
  chain: Chain,
  amount: Big,
  amountRaw: string
): PhaseIO<Token, Chain> {
  return { amount, amountRaw, chain, token };
}
