/**
 * Relayer Execution Script
 *
 * This script demonstrates the full relayer flow with real contracts and secrets on Amoy testnet:
 * 1. Use existing ERC20 contract at specified address
 * 2. Use existing TokenRelayer at specified address
 * 3. User1 (from secret1) signs permit and payload for transfer to User2
 * 4. Relayer (from relayerSecret) executes the transaction
 * 5. Verify balances
 *
 * Environment variables required:
 * - SECRET1: Private key for user1
 * - SECRET2: Private key for user2 (address derived for recipient)
 * - RELAYER_SECRET: Private key for relayer
 *
 * Run with: node test/relayer-execution.ts
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

// Define Amoy chain
const amoy = {
  blockExplorers: { default: { name: "PolygonScan", url: "https://amoy.polygonscan.com" } },
  id: 80002,
  name: "Polygon Amoy",
  nativeCurrency: { decimals: 18, name: "MATIC", symbol: "MATIC" },
  network: "amoy",
  rpcUrls: { default: { http: ["https://rpc-amoy.polygon.technology"] } }
};

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
  const ERC20_ADDRESS: Address = "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582";
  const RELAYER_ADDRESS: Address = "0x55cDfA4C105C5A30d40a3a712bc31B4456359897";

  // Get secrets from environment
  const secret1 = process.env.SECRET1;
  const secret2 = process.env.SECRET2;
  const relayerSecret = process.env.RELAYER_SECRET;

  if (!secret1 || !secret2 || !relayerSecret) {
    throw new Error("Missing required environment variables: SECRET1, SECRET2, RELAYER_SECRET");
  }

  // Create clients
  const publicClient = createPublicClient({ chain: amoy, transport: http() });
  const relayerWalletClient = createWalletClient({
    account: privateKeyToAccount(`0x${relayerSecret}` as `0x${string}`),
    chain: amoy,
    transport: http()
  });

  // Create accounts
  const user1Account = privateKeyToAccount(`0x${secret1}` as `0x${string}`);
  const user2Account = privateKeyToAccount(`0x${secret2}` as `0x${string}`);

  console.log("User1:", user1Account.address);
  console.log("User2:", user2Account.address);
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

  const user2BalanceBefore = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [user2Account.address],
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
  console.log("User2 balance:", formatUnits(user2BalanceBefore, 6));
  console.log("Relayer balance:", formatUnits(relayerBalanceBefore, 6));

  // Assume user1 has some tokens (as per requirements)
  if (user1BalanceBefore === 0n) {
    console.log("Warning: User1 has 0 tokens. Please ensure User1 has tokens in the ERC20 contract.");
    return;
  }

  // Prepare permit parameters
  const transferAmount = 1n * 10n ** 6n; // Transfer 1 token (assuming 6 decimals)
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
    chainId: amoy.id,
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

  const payloadData = encodeFunctionData({
    abi: transferAbi,
    args: [user2Account.address, transferAmount],
    functionName: "transfer"
  });

  console.log("\n--- Payload Parameters ---");
  console.log("Destination:", ERC20_ADDRESS);
  console.log("Data (transfer from relayer to User2):", payloadData);
  console.log("Recipient:", user2Account.address);
  console.log("Amount:", transferAmount.toString());
  console.log("Nonce:", payloadNonce.toString());
  console.log("Deadline:", payloadDeadline.toString());

  // Sign payload
  const relayerDomain = {
    chainId: amoy.id,
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
    destination: ERC20_ADDRESS,
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

  // Check final balances
  const user1BalanceAfter = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [user1Account.address],
    functionName: "balanceOf"
  })) as bigint;

  const user2BalanceAfter = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [user2Account.address],
    functionName: "balanceOf"
  })) as bigint;

  const relayerBalanceAfter = (await publicClient.readContract({
    abi: erc20Abi,
    address: ERC20_ADDRESS,
    args: [RELAYER_ADDRESS],
    functionName: "balanceOf"
  })) as bigint;

  console.log("\n--- Final Balances ---");
  console.log("User1 balance before:", formatUnits(user1BalanceBefore, 6));
  console.log("User1 balance after:", formatUnits(user1BalanceAfter, 6));
  console.log("User2 balance before:", formatUnits(user2BalanceBefore, 6));
  console.log("User2 balance after:", formatUnits(user2BalanceAfter, 6));
  console.log("Relayer balance before:", formatUnits(relayerBalanceBefore, 6));
  console.log("Relayer balance after:", formatUnits(relayerBalanceAfter, 6));

  console.log("\n--- Verification ---");
  const user1Diff = user1BalanceBefore - user1BalanceAfter;
  const user2Diff = user2BalanceAfter - user2BalanceBefore;
  console.log("User1 tokens spent:", formatUnits(user1Diff, 6));
  console.log("User2 tokens received:", formatUnits(user2Diff, 6));
  console.log("Expected transfer amount:", formatUnits(transferAmount, 6));

  if (user1Diff === transferAmount && user2Diff === transferAmount) {
    console.log("✅ Transfer successful!");
  } else {
    console.log("❌ Transfer verification failed!");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
