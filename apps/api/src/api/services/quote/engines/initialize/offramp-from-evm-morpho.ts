import { EvmClientManager, EvmNetworks, EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { BridgeMeta, QuoteContext } from "../../core/types";
import { assignPreNablaContext, BaseInitializeEngine } from "./index";

const vaultAbi = [
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export class OffRampFromEvmInitializeMorphoEngine extends BaseInitializeEngine {
  readonly config = {
    direction: RampDirection.SELL,
    skipNote: "OffRampFromEvmInitializeMorphoEngine: Skipped because rampType is BUY, this engine handles SELL operations only"
  };

  protected async executeInternal(ctx: QuoteContext): Promise<void> {
    const req = ctx.request;

    // 1. Resolve the Morpho vault and compute shares -> USDC conversion via previewRedeem.
    const vault = getMorphoVaultInfo("usdc-arbitrum");
    const evmClientManager = EvmClientManager.getInstance();
    const vaultNetwork = vault.network as EvmNetworks;
    const vaultClient = evmClientManager.getClient(vaultNetwork);

    const sharesAmountRaw = new Big(req.inputAmount).mul(new Big(10).pow(vault.shareDecimals)).toFixed(0, 0);

    const assetsFromShares = (await vaultClient.readContract({
      abi: vaultAbi,
      address: vault.vaultAddress,
      args: [BigInt(sharesAmountRaw)],
      functionName: "previewRedeem"
    })) as bigint;

    const expectedUsdcDecimal = new Big(assetsFromShares.toString()).div(new Big(10).pow(vault.depositAssetDecimals));

    // 2. Set up preNabla context (mirrors the standard offramp EVM flow)
    await assignPreNablaContext(ctx);

    // 3. Bridge context: when the vault is on Base, USDC is already on Base and no
    //    SquidRouter bridge is required. Surface a same-chain evmToEvm so downstream
    //    engines (e.g. OffRampSwapEngineEvm) can read outputAmountDecimal without
    //    conditional code paths. For non-Base vaults, fetch a real bridge quote.
    if (vaultNetwork === Networks.Base) {
      ctx.evmToEvm = {
        fromNetwork: vaultNetwork,
        fromToken: vault.depositAssetAddress as `0x${string}`,
        inputAmountDecimal: expectedUsdcDecimal,
        inputAmountRaw: assetsFromShares.toString(),
        networkFeeUSD: "0",
        outputAmountDecimal: expectedUsdcDecimal,
        outputAmountRaw: assetsFromShares.toString(),
        toNetwork: vaultNetwork,
        toToken: vault.depositAssetAddress as `0x${string}`
      } satisfies BridgeMeta;
    } else {
      const bridgeRequest: EvmBridgeQuoteRequest = {
        amountDecimal: expectedUsdcDecimal.toFixed(vault.depositAssetDecimals),
        fromNetwork: vaultNetwork,
        inputCurrency: EvmToken.USDC,
        outputCurrency: EvmToken.USDC,
        rampType: req.rampType,
        toNetwork: Networks.Base
      };

      const bridgeQuote = await getEvmBridgeQuote(bridgeRequest);

      ctx.evmToEvm = {
        ...bridgeRequest,
        fromToken: bridgeQuote.fromToken,
        inputAmountDecimal: new Big(bridgeRequest.amountDecimal),
        inputAmountRaw: bridgeQuote.inputAmountRaw,
        networkFeeUSD: bridgeQuote.networkFeeUSD,
        outputAmountDecimal: bridgeQuote.outputAmountDecimal,
        outputAmountRaw: bridgeQuote.outputAmountRaw,
        toToken: bridgeQuote.toToken
      };
    }

    // 4. Surface redeem metadata for the route-prep phase (compute share->USDC rate at quote time).
    ctx.redeemMeta = {
      expectedUsdcRaw: assetsFromShares.toString(),
      sharesAmountRaw,
      vaultAddress: vault.vaultAddress
    };

    ctx.addNote?.(
      `Morpho offramp init: ${sharesAmountRaw} vault shares on ${vaultNetwork} -> ~${expectedUsdcDecimal.toFixed()} USDC (previewRedeem)` +
        (vaultNetwork === Networks.Base
          ? ""
          : `; bridge to ${ctx.evmToEvm.outputAmountDecimal.toFixed()} USDC on ${Networks.Base}`)
    );
  }
}
