// Manual end-to-end example for the Mexico (MXN) Alfredpay offramp. MXN settles via SPEI
// (EPaymentMethod.SPEI). Offramp: USDC -> MXN. The SDK returns user-side EVM transactions to
// sign; push the resulting hashes/signatures back via submitUserTransactions, then start.
// fiatAccountId is REQUIRED here.
//
// Requires a running backend (default http://localhost:3000) with Alfredpay enabled.
//
// Prerequisites: authenticate with the user's own user-linked secretKey (their sk_* key), and
// that same user must have completed Alfredpay MXN KYC. Onboard the user through the Vortex app
// first; the SDK cannot mint keys or run KYC. Also needs that user's FIAT_ACCOUNT_ID below.
//
// Config is read from packages/sdk/.env (bun auto-loads it). See .env.example.
// Env: VORTEX_API_URL, VORTEX_PUBLIC_KEY, VORTEX_SECRET_KEY (user-linked),
//      OFFRAMP_WALLET_PRIVATE_KEY, FIAT_ACCOUNT_ID.
//
// Run:
//   cd packages/sdk
//   bun run examples/exampleMxnOfframp.ts

import * as readline from "readline";
import { privateKeyToAccount } from "viem/accounts";
import { CreateQuoteRequest, EPaymentMethod, EvmToken, FiatToken, Networks, QuoteResponse, RampDirection } from "../src/index";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}

// Optional: sign offramp permits locally (viem) with a throwaway wallet that holds the test USDC.
// viem derives the EIP712Domain canonically, so its signatures match the backend's ethers
// verifyTypedData exactly. If unset, you sign in your own wallet and paste the signature — but then
// WALLET_ADDRESS must be set to the address you'll sign with.
const OFFRAMP_WALLET_PRIVATE_KEY = process.env.OFFRAMP_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
const OFFRAMP_WALLET_ADDRESS = OFFRAMP_WALLET_PRIVATE_KEY
  ? privateKeyToAccount(OFFRAMP_WALLET_PRIVATE_KEY).address
  : requireEnv("WALLET_ADDRESS");
const FIAT_ACCOUNT_ID = requireEnv("FIAT_ACCOUNT_ID");

async function runMxnOfframpExample() {
  const askQuestion = (query: string): Promise<string> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(query, (ans: string) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  };

  try {
    console.log("Starting MXN Offramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: process.env.VORTEX_API_URL ?? "http://localhost:3000",
      autoReconnect: true,
      publicKey: requireEnv("VORTEX_PUBLIC_KEY"),
      // Must be the user's user-linked sk_* key, not a partner-only key.
      secretKey: requireEnv("VORTEX_SECRET_KEY"),
      storeEphemeralKeys: true
    };

    const sdk = new VortexSdk(config);
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for MXN offramp (USDC -> MXN via SPEI)...");
    const quoteRequest: CreateQuoteRequest = {
      from: Networks.Polygon,
      inputAmount: "10",
      inputCurrency: EvmToken.USDC,
      network: Networks.Polygon,
      outputCurrency: FiatToken.MXN,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SPEI
    };

    const quote = (await sdk.createQuote(quoteRequest)) as QuoteResponse;
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    console.log("📝 Step 3: Registering offramp (fiatAccountId + walletAddress required)...");
    const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
      fiatAccountId: FIAT_ACCOUNT_ID,
      walletAddress: OFFRAMP_WALLET_ADDRESS
    });
    console.log(`✅ MXN Offramp registered successfully. Ramp ID: ${rampProcess.id}`);

    const localAccount = OFFRAMP_WALLET_PRIVATE_KEY ? privateKeyToAccount(OFFRAMP_WALLET_PRIVATE_KEY) : undefined;

    await sdk.submitUserTransactions(rampProcess.id, unsignedTransactions, {
      sendTransaction: async (evmTx, { unsignedTransaction }) => {
        console.log(
          `\n🛑 Broadcast ${unsignedTransaction.phase} from your wallet: to=${evmTx.to} value=${evmTx.value} data=${evmTx.data}`
        );
        const hash = await askQuestion(`➡️  Tx hash for ${unsignedTransaction.phase}: `);
        console.log(`✅ Received hash for ${unsignedTransaction.phase}.`);
        return hash;
      },
      signTypedData: async (payload, { payloadCount, payloadIndex, unsignedTransaction }) => {
        if (localAccount) {
          const signature = await localAccount.signTypedData(payload as Parameters<typeof localAccount.signTypedData>[0]);
          console.log(
            `     [${payloadIndex + 1}/${payloadCount}] ${payload.primaryType} signed locally by ${localAccount.address}`
          );
          return signature;
        }

        const [v4Payload] = sdk
          .getTypedDataToSign(unsignedTransaction, { includeDomainType: true })
          .slice(payloadIndex, payloadIndex + 1);
        console.log(
          `\n----- sign payload ${payloadIndex + 1}/${payloadCount}: ${payload.primaryType} (account ${unsignedTransaction.signer}) -----`
        );
        console.log(JSON.stringify(v4Payload, null, 2));
        const signature = await askQuestion(`➡️  Signature for ${payload.primaryType}: `);
        console.log(`✅ Received signature for ${unsignedTransaction.phase}.`);
        return signature;
      }
    });

    console.log("📝 Step 4: Starting offramp...");
    await sdk.startRamp(rampProcess.id);
    console.log("✅ MXN Offramp started successfully.");
  } catch (error) {
    console.error("❌ Error in MXN Offramp Example:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runMxnOfframpExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
