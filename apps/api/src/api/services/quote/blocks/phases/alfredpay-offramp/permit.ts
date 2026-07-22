import { type EvmNetworks, Networks, type TypedDataDomain } from "@vortexfi/shared";
import { encodeAbiParameters, keccak256, type PublicClient, pad, parseAbiParameters, toHex } from "viem";

export const ALFREDPAY_RELAYER_ADDRESSES: Partial<Record<EvmNetworks, `0x${string}`>> = {
  [Networks.Arbitrum]: "0xC9ECD03c89349B3EAe4613c7091c6c3029413785",
  [Networks.Base]: "0xDbece5cE27984FC64688bcC57f75b96a28e8c68c",
  [Networks.Polygon]: "0xC9ECD03c89349B3EAe4613c7091c6c3029413785",
  [Networks.Avalanche]: "0x11871C77Aa0170ae13864E4E82cFa471720e045e",
  [Networks.Ethereum]: "0x522A51f9c5B1683F0F15910075487c4D162A8b83",
  [Networks.BSC]: "0x2d657ac14088fED401b58FEd377988ed3F875220"
};

export function getAlfredpayRelayerAddress(network: EvmNetworks): `0x${string}` {
  const address = ALFREDPAY_RELAYER_ADDRESSES[network];
  if (!address) throw new Error(`No TokenRelayer deployed on ${network}`);
  return address;
}

export async function resolveAlfredpayPermitDomain(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  chainId: number,
  tokenName: string
): Promise<TypedDataDomain> {
  let version = "1";
  try {
    version = (await publicClient.readContract({
      abi: [{ inputs: [], name: "version", outputs: [{ type: "string" }], stateMutability: "view", type: "function" }],
      address: tokenAddress,
      functionName: "version"
    })) as string;
  } catch {
    // Tokens without version() conventionally use EIP-2612 version 1.
  }
  const standardHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, uint256, address"), [
      keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
      keccak256(toHex(tokenName)),
      keccak256(toHex(version)),
      BigInt(chainId),
      tokenAddress
    ])
  );
  const minimalHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address"), [
      keccak256(toHex("EIP712Domain(uint256 chainId,address verifyingContract)")),
      BigInt(chainId),
      tokenAddress
    ])
  );
  let separator: `0x${string}` | undefined;
  try {
    separator = (await publicClient.readContract({
      abi: [
        { inputs: [], name: "DOMAIN_SEPARATOR", outputs: [{ type: "bytes32" }], stateMutability: "view", type: "function" }
      ],
      address: tokenAddress,
      functionName: "DOMAIN_SEPARATOR"
    })) as `0x${string}`;
  } catch {
    // Without an on-chain separator, use the standard EIP-2612 domain.
  }
  if (!separator || separator === standardHash) return { chainId, name: tokenName, verifyingContract: tokenAddress, version };
  if (separator === minimalHash) return { chainId, verifyingContract: tokenAddress } as TypedDataDomain;
  const salt = pad(toHex(chainId), { size: 32 });
  const saltHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32, address, bytes32"), [
      keccak256(toHex("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)")),
      keccak256(toHex(tokenName)),
      keccak256(toHex(version)),
      tokenAddress,
      salt
    ])
  );
  if (separator === saltHash) return { name: tokenName, salt, verifyingContract: tokenAddress, version };
  throw new Error(
    `Token ${tokenName} has unexpected DOMAIN_SEPARATOR. Expected standard: ${standardHash}, minimal: ${minimalHash} or salt: ${saltHash}, got: ${separator}`
  );
}
