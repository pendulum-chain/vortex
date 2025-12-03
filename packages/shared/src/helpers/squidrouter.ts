import { createConfig, readContract } from "@wagmi/core";
import { moonbeam } from "@wagmi/core/chains";
import { encodePacked, sha256, webSocket } from "viem";
import { squidReceiverABI } from "../contracts/SquidReceiver";
import { squidRouterConfigBase } from "../index";
import { MOONBEAM_WSS } from "../tokens/constants/misc";

export const moonbeamConfig = createConfig({
  chains: [moonbeam],
  transports: {
    [moonbeam.id]: webSocket(MOONBEAM_WSS)
  }
});

export async function isHashRegistered(hash: `0x${string}`): Promise<boolean> {
  const result = (await readContract(moonbeamConfig, {
    abi: squidReceiverABI,
    address: squidRouterConfigBase.receivingContractAddress,
    args: [hash],
    chainId: moonbeam.id,
    functionName: "xcmDataMapping"
  })) as bigint;

  return result > 0n;
}

export function createRandomString(byteLength: number): `0x${string}` {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);

  return Array.from(array).reduce<`0x${string}`>((string, byte) => `${string}${byte.toString(16).padStart(2, "0")}`, "0x");
}

export function createSquidRouterHash(id: `0x${string}`, payload: `0x${string}`): `0x${string}` {
  const packedEncoding = encodePacked(["bytes32", "bytes"], [id, payload]);

  return sha256(packedEncoding);
}
