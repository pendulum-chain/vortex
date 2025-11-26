import { multiplyByPowerOfTen } from "@vortexfi/shared";
import { getAccount, readContract, signTypedData, switchChain } from "@wagmi/core";
import { wagmiConfig } from "../wagmiConfig";

export async function signERC2612Permit(
  owner: `0x${string}`,
  spender: `0x${string}`,
  valueUnits: string,
  tokenAddress: `0x${string}`,
  decimals: number,
  chainId: number,
  tokenName: string
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number; deadline: number }> {
  const account = getAccount(wagmiConfig);
  const originalChainId = account.chainId;

  const value = multiplyByPowerOfTen(valueUnits, decimals);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600); // 1 week from now

  if (originalChainId && originalChainId !== chainId) {
    console.log(`Switching to chain ${chainId} from chain ${originalChainId} for permit signing`);
    try {
      await switchChain(wagmiConfig, { chainId });
    } catch (error) {
      console.error("Failed to switch chain for permit signing:", error);
      throw new Error(`Failed to switch to chain ${chainId} for permit signing. Please switch manually and try again.`);
    }
  }

  try {
    const nonce = (await readContract(wagmiConfig, {
      abi: [
        {
          inputs: [{ name: "owner", type: "address" }],
          name: "nonces",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        }
      ],
      address: tokenAddress,
      args: [owner],
      chainId: chainId,
      functionName: "nonces"
    })) as bigint;

    const domain = {
      chainId: BigInt(chainId),
      name: tokenName,
      verifyingContract: tokenAddress,
      version: "1"
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const message = {
      deadline,
      nonce,
      owner,
      spender,
      value
    };
    console.log("DEBUG: Signing ERC2612 Permit with message:", message);

    const signature = await signTypedData(wagmiConfig, {
      account: owner,
      domain,
      message,
      primaryType: "Permit",
      types
    });

    const v = parseInt(signature.slice(130, 132), 16);
    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;

    return { deadline: Number(deadline), r, s, v };
  } catch (error) {
    throw new Error("Failed to sign ERC2612 permit: " + error);
  } finally {
    if (originalChainId && originalChainId !== chainId) {
      console.log(`Switching back to original chain ${originalChainId} after permit signing`);
      try {
        await switchChain(wagmiConfig, { chainId: originalChainId });
      } catch (switchError) {
        console.warn("Failed to switch back to original chain after permit signing:", switchError);
      }
    }
  }
}
