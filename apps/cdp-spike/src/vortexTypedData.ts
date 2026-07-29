import type { Address, Hex, TypedData } from "viem";

interface VortexTypedDataDomain {
  chainId?: number;
  name?: string;
  salt?: Hex;
  verifyingContract?: Address;
  version?: string;
}

export interface VortexTypedData {
  domain: VortexTypedDataDomain;
  message: Record<string, unknown>;
  name: string;
  primaryType: string;
  types: TypedData;
}

interface CdpTypedData {
  domain: VortexTypedDataDomain;
  message: Record<string, unknown>;
  primaryType: string;
  types: Record<string, unknown>;
}

const TOKEN = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const RELAYER = "0x3333333333333333333333333333333333333333";
const DESTINATION = "0x4444444444444444444444444444444444444444";

export function toCdpTypedData(input: VortexTypedData): CdpTypedData {
  const domainFields: Array<{ name: string; type: string }> = [];
  if (input.domain.name !== undefined) domainFields.push({ name: "name", type: "string" });
  if (input.domain.version !== undefined) domainFields.push({ name: "version", type: "string" });
  if (input.domain.chainId !== undefined) domainFields.push({ name: "chainId", type: "uint256" });
  if (input.domain.verifyingContract !== undefined) {
    domainFields.push({ name: "verifyingContract", type: "address" });
  }
  if (input.domain.salt !== undefined) domainFields.push({ name: "salt", type: "bytes32" });

  return {
    domain: input.domain,
    message: input.message,
    primaryType: input.primaryType,
    types: {
      EIP712Domain: domainFields,
      ...input.types
    }
  };
}

export function makeVortexTypedDataFixtures(owner: Address): VortexTypedData[] {
  const permitTypes = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  } as const;
  const permitMessage = {
    deadline: "1999999999",
    nonce: "0",
    owner,
    spender: SPENDER,
    value: "1000000"
  };

  return [
    {
      domain: {
        chainId: 137,
        name: "USD Coin",
        verifyingContract: TOKEN,
        version: "2"
      },
      message: permitMessage,
      name: "ERC-20 permit",
      primaryType: "Permit",
      types: permitTypes
    },
    {
      domain: {
        name: "Tether USD",
        salt: `0x${BigInt(137).toString(16).padStart(64, "0")}` as Hex,
        verifyingContract: TOKEN,
        version: "1"
      },
      message: permitMessage,
      name: "Salted ERC-20 permit",
      primaryType: "Permit",
      types: permitTypes
    },
    {
      domain: {
        chainId: 8453,
        name: "TokenRelayer",
        verifyingContract: RELAYER,
        version: "1"
      },
      message: {
        data: "0x1234",
        deadline: "1999999999",
        destination: DESTINATION,
        ethValue: "0",
        nonce: "1",
        owner,
        token: TOKEN,
        value: "1000000"
      },
      name: "TokenRelayer payload",
      primaryType: "Payload",
      types: {
        Payload: [
          { name: "destination", type: "address" },
          { name: "owner", type: "address" },
          { name: "token", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "ethValue", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      }
    },
    {
      domain: {
        chainId: 8453,
        name: "Permit2",
        verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3"
      },
      message: {
        deadline: "1999999999",
        nonce: "7",
        permitted: { amount: "1000000", token: TOKEN },
        spender: SPENDER
      },
      name: "Permit2 transfer",
      primaryType: "PermitTransferFrom",
      types: {
        PermitTransferFrom: [
          { name: "permitted", type: "TokenPermissions" },
          { name: "spender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ],
        TokenPermissions: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" }
        ]
      }
    }
  ];
}
