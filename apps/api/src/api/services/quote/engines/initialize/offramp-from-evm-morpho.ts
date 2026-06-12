import { EvmClientManager, EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { EvmBridgeQuoteRequest, getEvmBridgeQuote } from "../../core/squidrouter";
import { QuoteContext } from "../../core/types";
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

    if (req.from !== Networks.Ethereum) {
      throw new Error(`OffRampFromEvmInitializeMorphoEngine: expected from=Ethereum, got ${req.from}`);
    }

    // 1. Resolve the Morpho vault and compute shares -> USDC conversion via previewRedeem.
    const vault = getMorphoVaultInfo("usdc-ethereum");
    const evmClientManager = EvmClientManager.getInstance();
    const ethereumClient = evmClientManager.getClient(Networks.Ethereum);

    const sharesAmountRaw = new Big(req.inputAmount).mul(new Big(10).pow(vault.shareDecimals)).toFixed(0, 0);

    const assetsFromShares = (await ethereumClient.readContract({
      abi: vaultAbi,
      address: vault.vaultAddress,
      args: [BigInt(sharesAmountRaw)],
      functionName: "previewRedeem"
    })) as bigint;

    const expectedUsdcDecimal = new Big(assetsFromShares.toString()).div(new Big(10).pow(vault.depositAssetDecimals));

    // 2. Set up preNabla context (mirrors the standard offramp EVM flow)
    await assignPreNablaContext(ctx);

    // 3. Get bridge quote: USDC on Ethereum -> USDC on Base
    const bridgeRequest: EvmBridgeQuoteRequest = {
      amountDecimal: expectedUsdcDecimal.toFixed(vault.depositAssetDecimals),
      fromNetwork: Networks.Ethereum,
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

    // 4. Surface redeem metadata for the route-prep phase (compute share->USDC rate at quote time).
    ctx.redeemMeta = {
      expectedUsdcRaw: assetsFromShares.toString(),
      sharesAmountRaw,
      vaultAddress: vault.vaultAddress
    };

    ctx.addNote?.(
      `Morpho offramp init: ${sharesAmountRaw} vault shares -> ~${expectedUsdcDecimal.toFixed()} USDC (previewRedeem); bridge to ${bridgeQuote.outputAmountDecimal.toFixed()} USDC on Base`
    );
  }
}
