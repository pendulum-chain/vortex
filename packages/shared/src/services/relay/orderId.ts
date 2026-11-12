import { hashStruct } from "viem";
import type { RelayOrderData } from "./schemas";

/**
 * EVM path of `getOrderId` from @relay-protocol/settlement-sdk 0.0.153, ported because the package
 * pulls in tronweb, solana, ton and bitcoinjs. `relayOrderDataSchema` already limits addresses and
 * bytes to EVM hex, which is all the SDK's normalization does for an EVM chain.
 */
const ORDER_EIP712_TYPES = {
  Fee: [
    { name: "recipientChainId", type: "string" },
    { name: "recipient", type: "bytes" },
    { name: "currencyChainId", type: "string" },
    { name: "currency", type: "bytes" },
    { name: "amount", type: "uint256" }
  ],
  Input: [
    { name: "payment", type: "InputPayment" },
    { name: "refunds", type: "InputRefund[]" }
  ],
  InputPayment: [
    { name: "chainId", type: "string" },
    { name: "currency", type: "bytes" },
    { name: "amount", type: "uint256" },
    { name: "weight", type: "uint256" }
  ],
  InputRefund: [
    { name: "chainId", type: "string" },
    { name: "recipient", type: "bytes" },
    { name: "currency", type: "bytes" },
    { name: "minimumAmount", type: "uint256" },
    { name: "deadline", type: "uint32" },
    { name: "extraData", type: "bytes" }
  ],
  Order: [
    { name: "version", type: "string" },
    { name: "solverChainId", type: "string" },
    { name: "solver", type: "address" },
    { name: "salt", type: "uint256" },
    { name: "inputs", type: "Input[]" },
    { name: "output", type: "Output" },
    { name: "fees", type: "Fee[]" }
  ],
  Output: [
    { name: "chainId", type: "string" },
    { name: "payments", type: "OutputPayment[]" },
    { name: "deadline", type: "uint32" },
    { name: "calls", type: "bytes[]" },
    { name: "extraData", type: "bytes" }
  ],
  OutputPayment: [
    { name: "recipient", type: "bytes" },
    { name: "currency", type: "bytes" },
    { name: "minimumAmount", type: "uint256" },
    { name: "expectedAmount", type: "uint256" }
  ]
};

export function computeRelayOrderId(order: RelayOrderData): `0x${string}` {
  // Loosely typed on purpose: amounts stay wire strings, which the EIP-712 encoder reads as integers.
  return hashStruct({ data: order, primaryType: "Order", types: ORDER_EIP712_TYPES });
}
