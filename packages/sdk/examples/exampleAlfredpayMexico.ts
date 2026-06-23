// Manual end-to-end example for the Mexico (MXN) Alfredpay flow, both directions.
// MXN settles via SPEI (EPaymentMethod.SPEI). Mirrors the README Alfredpay sections
// Real SDK contract: createQuote -> registerRamp -> (onramp: startRamp) /
//                    (offramp: sign user txs via submitUserSignature/submitUserTxHash) -> startRamp.
//
// Requires a running backend (default http://localhost:3000) with Alfredpay enabled.
// Replace the placeholder addresses / fiatAccountId before running.
//
// Run:
//   cd packages/sdk
//   bun run examples/exampleAlfredpayMexico.ts onramp
//   bun run examples/exampleAlfredpayMexico.ts offramp   # default

import * as fs from "fs";
import * as readline from "readline";
import { privateKeyToAccount } from "viem/accounts";
import { CreateQuoteRequest, EPaymentMethod, EvmToken, FiatToken, Networks, QuoteResponse, RampDirection } from "../src/index";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

// Optional: sign offramp permits locally (viem) with a throwaway wallet that holds the test USDC.
// viem derives the EIP712Domain canonically, so its signatures match the backend's ethers
// verifyTypedData exactly. If unset, you sign in your own wallet and paste the signature.
const OFFRAMP_WALLET_PRIVATE_KEY = process.env.OFFRAMP_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
const OFFRAMP_WALLET_ADDRESS = OFFRAMP_WALLET_PRIVATE_KEY
  ? privateKeyToAccount(OFFRAMP_WALLET_PRIVATE_KEY).address
  : "0xYOUR_WALLET_ADDRESS";
const DESTINATION_ADDRESS = "0xYOUR_WALLET_ADDRESS";
const WALLET_ADDRESS = "0xYOUR_WALLET_ADDRESS";
const FIAT_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, (ans: string) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function buildSdk(): VortexSdk {
  const config: VortexSdkConfig = {
    apiBaseUrl: "<Vortex_API_URL>",
    autoReconnect: true,
    publicKey: "<Vortex_Public_Key>",
    storeEphemeralKeys: true
  };
  return new VortexSdk(config);
}

function logQuote(quote: QuoteResponse): void {
  console.log("✅ Quote created:");
  console.log(`   Quote ID: ${quote.id}`);
  console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
  console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
  console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
  console.log(`   Expires at: ${quote.expiresAt}\n`);
}

// USDT on Polygon — the token Alfredpay mints; what you deposit to the ephemeral to simulate the fiat pay-in.
const USDT_POLYGON_ADDRESS = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // 6 decimals

// The SDK writes ephemeral keys to ./ephemerals_<rampId>.json (storeEphemeralKeys: true).
function readEphemeralEvmAddress(rampId: string): string | undefined {
  try {
    const items = JSON.parse(fs.readFileSync(`ephemerals_${rampId}.json`, "utf-8"));
    return items.find((i: { type: string; address: string }) => i.type === "EVM")?.address;
  } catch {
    return undefined;
  }
}

// Onramp: MXN -> USDC. User pays SPEI instructions; crypto lands at destinationAddress.
// No user-signed transactions; fiatAccountId is NOT required for onramp.
async function runMexicoOnramp(sdk: VortexSdk): Promise<void> {
  console.log("📝 Step 1: Creating quote for MXN onramp (MXN -> USDC via SPEI)...");
  const quoteRequest: CreateQuoteRequest = {
    from: EPaymentMethod.SPEI,
    inputAmount: "201",
    inputCurrency: FiatToken.MXN,
    network: Networks.Polygon,
    outputCurrency: EvmToken.USDC,
    rampType: RampDirection.BUY,
    to: Networks.Polygon
  };

  const quote = await sdk.createQuote(quoteRequest);
  logQuote(quote);

  console.log("📝 Step 2: Registering onramp (destinationAddress only — fiatAccountId optional)...");
  const { rampProcess } = await sdk.registerRamp(quote, {
    destinationAddress: DESTINATION_ADDRESS,
    walletAddress: WALLET_ADDRESS
  });
  console.log(`✅ Onramp registered. Ramp ID: ${rampProcess.id}`);

  console.log("📝 Step 3: Starting onramp...");
  const startedRamp = await sdk.startRamp(rampProcess.id);

  // To complete the onramp WITHOUT paying fiat, deposit USDT to the ephemeral so the
  // alfredpayOnrampMint balance check passes (it trusts the on-chain balance as ground truth).
  const ephemeralEvmAddress = readEphemeralEvmAddress(rampProcess.id);
  console.log("\n🏦 To complete the onramp, deposit USDT on POLYGON to the ephemeral address:");
  console.log(`   • Send USDT to: ${ephemeralEvmAddress ?? `<EVM address in ephemerals_${rampProcess.id}.json>`}`);
  console.log(`   • USDT token (Polygon): ${USDT_POLYGON_ADDRESS} (6 decimals)`);
  console.log(`   • Amount: a little more than ${quote.outputAmount} USDC-equivalent in USDT`);
  console.log("     (exact raw amount is in the backend 'AlfredpayOnrampMintHandler: Waiting for <raw> ...' log)");

  if (startedRamp.achPaymentData) {
    console.log("\n(SPEI fiat instructions, not needed for the deposit-to-ephemeral test):");
    console.log(startedRamp.achPaymentData);
  }
}

// Offramp: USDC -> MXN. SDK returns user-side EVM transactions to sign; push the
// resulting hashes back via updateRamp, then start. fiatAccountId is REQUIRED here.
async function runMexicoOfframp(sdk: VortexSdk): Promise<void> {
  console.log("📝 Step 1: Creating quote for MXN offramp (USDC -> MXN via SPEI)...");
  const quoteRequest: CreateQuoteRequest = {
    from: Networks.Polygon,
    inputAmount: "10",
    inputCurrency: EvmToken.USDC,
    network: Networks.Polygon,
    outputCurrency: FiatToken.MXN,
    rampType: RampDirection.SELL,
    to: EPaymentMethod.SPEI
  };

  const quote = await sdk.createQuote(quoteRequest);
  logQuote(quote);

  console.log("📝 Step 2: Registering offramp (fiatAccountId + walletAddress required)...");
  const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
    fiatAccountId: FIAT_ACCOUNT_ID,
    walletAddress: OFFRAMP_WALLET_ADDRESS
  });
  console.log(`✅ Offramp registered. Ramp ID: ${rampProcess.id}`);

  // Handle each user transaction with the SDK's helpers (no EIP-712 reconstruction needed here).
  const localAccount = OFFRAMP_WALLET_PRIVATE_KEY ? privateKeyToAccount(OFFRAMP_WALLET_PRIVATE_KEY) : undefined;

  for (const tx of unsignedTransactions) {
    const txType = sdk.getUserTransactionType(tx);

    if (txType === "evm-typed-data") {
      // A typed-data tx may carry several payloads (e.g. permit + relayer payload). Sign each in order.
      const payloads = sdk.getTypedDataToSign(tx); // wagmi / viem signTypedData-ready
      const v4Payloads = sdk.getTypedDataToSign(tx, { includeDomainType: true }); // eth_signTypedData_v4-ready
      const signatures: string[] = [];

      for (let i = 0; i < payloads.length; i++) {
        if (localAccount) {
          signatures.push(await localAccount.signTypedData(payloads[i] as Parameters<typeof localAccount.signTypedData>[0]));
          console.log(
            `     [${i + 1}/${payloads.length}] ${payloads[i].primaryType} signed locally by ${localAccount.address}`
          );
        } else {
          console.log(
            `\n----- sign payload ${i + 1}/${payloads.length}: ${payloads[i].primaryType} (account ${tx.signer}) -----`
          );
          console.log(JSON.stringify(v4Payloads[i], null, 2));
          signatures.push(await askQuestion(`➡️  Signature for ${payloads[i].primaryType}: `));
        }
      }

      console.log(`📝 Submitting ${signatures.length} signature(s) for ${tx.phase}...`);
      await sdk.submitUserSignature(rampProcess.id, tx, signatures);
      console.log(`✅ Submitted signature(s) for ${tx.phase}.`);
    } else if (txType === "evm-transaction") {
      // Broadcast path: user sends the EVM tx from their wallet, then pushes the hash back.
      const evmTx = sdk.getTransactionToBroadcast(tx);
      console.log(`\n🛑 Broadcast ${tx.phase} from your wallet: to=${evmTx.to} value=${evmTx.value} data=${evmTx.data}`);
      const hash = await askQuestion(`➡️  Tx hash for ${tx.phase}: `);
      await sdk.submitUserTxHash(rampProcess.id, tx, hash);
      console.log(`✅ Submitted hash for ${tx.phase}.`);
    } else {
      throw new Error(`Unsupported user transaction for phase ${tx.phase} on ${tx.network}`);
    }
  }

  console.log("📝 Step 4: Starting offramp...");
  await sdk.startRamp(rampProcess.id);
  console.log("✅ Offramp started.");
}

async function main(): Promise<void> {
  const direction = (process.argv[2] ?? "offramp").toLowerCase();
  console.log(`Starting Mexico (MXN) Alfredpay ${direction} example...\n`);

  const sdk = buildSdk();

  if (direction === "onramp") {
    await runMexicoOnramp(sdk);
  } else if (direction === "offramp") {
    await runMexicoOfframp(sdk);
  } else {
    throw new Error(`Unknown direction "${direction}". Use "onramp" or "offramp".`);
  }
}

if (import.meta.main) {
  main()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
      }
      process.exit(1);
    });
}
