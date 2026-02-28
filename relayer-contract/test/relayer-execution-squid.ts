/**
 * Relayer Execution Script
 *
 * Similar to relayer-execution.ts but focused on testing the SquidRouter permit execution flow,
 * which includes both a permit signature and a payload signature.
 * This script simulates the entire process of creating the necessary signatures and executing the transaction through the relayer contract.
 *
 * Environment variables required:
 * - SECRET1: Private key for user1
 * - SECRET2: Private key for user2 (address derived for recipient)
 * - RELAYER_SECRET: Private key for relayer
 *
 * Run with: node test/relayer-execution-squid.ts
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  type Hash,
  http,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

// ABIs
const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "nonces",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  { inputs: [], name: "name", outputs: [{ name: "", type: "string" }], stateMutability: "view", type: "function" }
];

const transferAbi = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const tokenRelayerAbi = [
  {
    inputs: [
      {
        components: [
          { name: "token", type: "address" },
          { name: "owner", type: "address" },
          { name: "value", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "permitV", type: "uint8" },
          { name: "permitR", type: "bytes32" },
          { name: "permitS", type: "bytes32" },
          { name: "payloadData", type: "bytes" },
          { name: "payloadNonce", type: "uint256" },
          { name: "payloadDeadline", type: "uint256" },
          { name: "payloadV", type: "uint8" },
          { name: "payloadR", type: "bytes32" },
          { name: "payloadS", type: "bytes32" }
        ],
        name: "params",
        type: "tuple"
      }
    ],
    name: "execute",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

async function main() {
  console.log("=== TokenRelayer Execution Script ===\n");

  // Constants
  const ERC20_ADDRESS: Address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  const RELAYER_ADDRESS: Address = "0x93C399bB9D6736010Fa296a4eB3FEA148353F99D";
  const DESTINATION_ADDRESS: Address = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666"; // User2 address (derived from secret2)
  // Get secrets from environment
  const secret1 = process.env.SECRET1;
  const relayerSecret = process.env.RELAYER_SECRET;

  if (!secret1 || !relayerSecret) {
    throw new Error("Missing required environment variables: SECRET1, RELAYER_SECRET");
  }

  // Create clients
  const publicClient = createPublicClient({ chain: polygon, transport: http() });
  const relayerWalletClient = createWalletClient({
    account: privateKeyToAccount(`0x${relayerSecret}` as `0x${string}`),
    chain: polygon,
    transport: http()
  });

  // Create accounts
  const user1Account = privateKeyToAccount(`0x${secret1}` as `0x${string}`);

  console.log("User1:", user1Account.address);
  console.log("Relayer:", relayerWalletClient.account.address);
  console.log("ERC20 Contract:", ERC20_ADDRESS);
  console.log("Relayer Contract:", RELAYER_ADDRESS);

  // Check initial balances
  const user1BalanceBefore = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [user1Account.address],
    functionName: "balanceOf"
  })) as bigint;

  const relayerBalanceBefore = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [RELAYER_ADDRESS],
    functionName: "balanceOf"
  })) as bigint;

  console.log("\n--- Initial Balances ---");
  console.log("User1 balance:", formatUnits(user1BalanceBefore, 6));
  console.log("Relayer balance:", formatUnits(relayerBalanceBefore, 6));

  if (user1BalanceBefore === 0n) {
    console.log("Warning: User1 has 0 tokens. Please ensure User1 has tokens in the ERC20 contract.");
    return;
  }

  // Prepare permit parameters
  const transferAmount = 1n * 10n ** 5n; // Transfer 0.1 token (assuming 6 decimals)
  const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
  const user1Nonce = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [user1Account.address],
    functionName: "nonces"
  })) as bigint;

  console.log("\n--- Permit Parameters ---");
  console.log("Owner:", user1Account.address);
  console.log("Spender:", RELAYER_ADDRESS);
  console.log("Value:", transferAmount.toString());
  console.log("Deadline:", permitDeadline.toString());
  console.log("Nonce:", user1Nonce.toString());

  // Get token name
  const tokenName = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    functionName: "name"
  })) as string;

  console.log("Token name:", tokenName);

  // Sign permit
  const domain = {
    chainId: polygon.id,
    name: tokenName, // USDC uses version 2
    verifyingContract: ERC20_ADDRESS,
    version: "2"
  };

  const permitTypes = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  const permitMessage = {
    deadline: permitDeadline,
    nonce: user1Nonce,
    owner: user1Account.address,
    spender: RELAYER_ADDRESS,
    value: transferAmount
  };

  const permitSignature = await user1Account.signTypedData({
    domain,
    message: permitMessage,
    primaryType: "Permit",
    types: permitTypes
  });
  const permitR = `0x${permitSignature.slice(2, 66)}` as `0x${string}`;
  const permitS = `0x${permitSignature.slice(66, 130)}` as `0x${string}`;
  const permitV = parseInt(permitSignature.slice(130, 132), 16);
  console.log("Permit signature created");

  // Prepare payload - transfer from relayer to User2
  const payloadNonce = 0; // Use timestamp as nonce to avoid reuse
  const payloadDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const payloadData =
    "0x58181a800000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c335900000000000000000000000000000000000000000000000000000000000186a00000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000700000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000004800000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000078000000000000000000000000000000000000000000000000000000000000009a00000000000000000000000000000000000000000000000000000000000000b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c3359000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044095ea7b300000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c33590000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000e404e45aaf0000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c3359000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f0000000000000000000000000000000000000000000000000000000000000064000000000000000000000000ad6cea45f98444a922a2b4fe96b8c90f0862d2f400000000000000000000000000000000000000000000000000000000000186a000000000000000000000000000000000000000000000000000000000000185ba00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c335900000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000782cf7c3f427a4551a68f436e34615db2cf24426000000000000000000000000000000000000000000000000000000000000007d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000044095ea7b300000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000068b3465833fb72a70ecdf485e0e4c7bd8665fc45000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000e404e45aaf000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f0000000000000000000000000d500b1d8e8ef31e21c99d1db9a6444d3adf127000000000000000000000000000000000000000000000000000000000000001f4000000000000000000000000ad6cea45f98444a922a2b4fe96b8c90f0862d2f400000000000000000000000000000000000000000000000000000000000186230000000000000000000000000000000000000000000000000bfe8992757e7a440000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000242e1a7d4d00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000d500b1d8e8ef31e21c99d1db9a6444d3adf1270000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020000000000000000000000004f1876c3f7ee80be70a057511833b93d2ab2dfc4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000000000000000000bcedae7e2342166a4b8fa3a8b3180bb7";

  console.log("\n--- Payload Parameters ---");
  console.log("Destination:", ERC20_ADDRESS);
  console.log("Data (transfer from relayer to User2):", payloadData);
  console.log("Amount:", transferAmount.toString());
  console.log("Nonce:", payloadNonce.toString());
  console.log("Deadline:", payloadDeadline.toString());

  // Sign payload
  const relayerDomain = {
    chainId: polygon.id,
    name: "TokenRelayer",
    verifyingContract: RELAYER_ADDRESS,
    version: "1"
  };

  const payloadTypes = {
    Payload: [
      { name: "destination", type: "address" },
      { name: "data", type: "bytes" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };

  const payloadMessage = {
    data: payloadData,
    deadline: payloadDeadline,
    destination: DESTINATION_ADDRESS,
    nonce: payloadNonce
  };

  const payloadSignature = await user1Account.signTypedData({
    domain: relayerDomain,
    message: payloadMessage,
    primaryType: "Payload",
    types: payloadTypes
  });
  const payloadR = `0x${payloadSignature.slice(2, 66)}` as `0x${string}`;
  const payloadS = `0x${payloadSignature.slice(66, 130)}` as `0x${string}`;
  const payloadV = parseInt(payloadSignature.slice(130, 132), 16);
  console.log("Payload signature created");

  // Execute via relayer
  console.log("\n--- Executing Relayer ---");
  console.log("This will:");
  console.log("1. Execute permit to approve tokens");
  console.log("2. Transfer tokens from user1 to relayer");
  console.log("3. Execute payload: transfer from relayer to User2");

  try {
    const hash = await relayerWalletClient.writeContract({
      abi: tokenRelayerAbi,
      address: RELAYER_ADDRESS,
      args: [
        {
          deadline: permitDeadline,
          owner: user1Account.address,
          payloadData: payloadData,
          payloadDeadline: payloadDeadline,
          payloadNonce: payloadNonce,
          payloadR: payloadR,
          payloadS: payloadS,
          payloadV: payloadV,
          permitR: permitR,
          permitS: permitS,
          permitV: permitV,
          token: ERC20_ADDRESS,
          value: transferAmount
        }
      ],
      functionName: "execute"
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Transaction hash:", hash);
    console.log("Gas used:", receipt.gasUsed.toString());
  } catch (error: any) {
    console.error("Execution failed:", error.message);
    return;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
