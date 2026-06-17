import { EvmClientManager, EvmNetworks, EvmToken } from "@vortexfi/shared";
import Big from "big.js";
import { getMorphoVaultInfo } from "../../../phases/handlers/morpho-vault-config";
import { evmIO } from "../core/io";
import type { ChainBrand, Phase, PhaseCtx, PhaseIO } from "../core/types";

const morphoVaultAbi = [
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" }
    ],
    name: "deposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "assets", type: "uint256" }],
    name: "previewDeposit",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export function MorphoMint<Chain extends ChainBrand>(): Phase<
  PhaseIO<typeof EvmToken.USDC, Chain>,
  PhaseIO<typeof EvmToken.MORPHO_VAULT, Chain>
> {
  return {
    name: "MorphoMint",
    phases: ["morphoDeposit"],
    async simulate(input, ctx) {
      const vault = getMorphoVaultInfo("usdc-arbitrum");
      const network = input.chain as EvmNetworks;
      const client = EvmClientManager.getInstance().getClient(network);

      const sharesRaw = (await client.readContract({
        abi: morphoVaultAbi,
        address: vault.vaultAddress,
        args: [BigInt(input.amountRaw)],
        functionName: "previewDeposit"
      })) as bigint;

      const sharesDecimal = new Big(sharesRaw.toString()).div(new Big(10).pow(vault.shareDecimals));

      ctx.addNote(`MorphoMint: ${input.amount} USDC -> ${sharesDecimal.toFixed()} vault shares on ${network}`);

      return evmIO(EvmToken.MORPHO_VAULT, input.chain as Chain, sharesDecimal, sharesRaw.toString(), {
        depositAssetAddress: vault.depositAssetAddress,
        expectedUsdcRaw: input.amountRaw,
        vaultAddress: vault.vaultAddress
      });
    }
  };
}
