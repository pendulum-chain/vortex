import { mainnet } from "@reown/appkit/networks";
import { Networks } from "@vortexfi/shared";
import { readContract } from "@wagmi/core";
import { wagmiConfig } from "../../wagmiConfig";

const MORPHO_VAULT_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export async function fetchMorphoVaultShareBalance(vaultAddress: `0x${string}`, owner: `0x${string}`): Promise<bigint | null> {
  try {
    const raw = (await readContract(wagmiConfig, {
      abi: MORPHO_VAULT_ABI,
      address: vaultAddress,
      args: [owner],
      chainId: mainnet.id,
      functionName: "balanceOf"
    })) as bigint;

    return raw;
  } catch (error) {
    console.error(`Error fetching Morpho vault share balance for ${vaultAddress}:`, error);
    return null;
  }
}

export const MORPHO_VAULT_NETWORK = Networks.Ethereum;
