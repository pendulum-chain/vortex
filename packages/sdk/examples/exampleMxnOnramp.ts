// Manual end-to-end example for the Mexico (MXN) Alfredpay onramp. MXN settles via SPEI
// (EPaymentMethod.SPEI). Onramp: MXN -> USDC. The user pays the SPEI instructions; crypto
// lands at destinationAddress. No user-signed transactions; fiatAccountId is NOT required.
//
// Requires a running backend (default http://localhost:3000) with Alfredpay enabled.
//
// Prerequisites: authenticate with the user's own user-linked secretKey (their sk_* key), and
// that same user must have completed Alfredpay MXN KYC. Onboard the user through the Vortex app
// first; the SDK cannot mint keys or run KYC.
//
// Config is read from packages/sdk/.env (bun auto-loads it). See .env.example.
// Env: VORTEX_API_URL, VORTEX_PUBLIC_KEY, VORTEX_SECRET_KEY (user-linked),
//      DESTINATION_ADDRESS, WALLET_ADDRESS.
//
// Run:
//   cd packages/sdk
//   bun run examples/exampleMxnOnramp.ts

import * as fs from "fs";
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

const DESTINATION_ADDRESS = requireEnv("DESTINATION_ADDRESS");
const WALLET_ADDRESS = requireEnv("WALLET_ADDRESS");

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

async function runMxnOnrampExample() {
  try {
    console.log("Starting MXN Onramp Example...\n");

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

    console.log("📝 Step 2: Creating quote for MXN onramp (MXN -> USDC via SPEI)...");
    const quoteRequest: CreateQuoteRequest = {
      from: EPaymentMethod.SPEI,
      inputAmount: "201",
      inputCurrency: FiatToken.MXN,
      network: Networks.Polygon,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Polygon
    };

    const quote = (await sdk.createQuote(quoteRequest)) as QuoteResponse;
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    console.log("📝 Step 3: Registering onramp (destinationAddress only — fiatAccountId optional)...");
    const { rampProcess } = await sdk.registerRamp(quote, {
      destinationAddress: DESTINATION_ADDRESS,
      walletAddress: WALLET_ADDRESS
    });
    console.log(`✅ MXN Onramp registered successfully. Ramp ID: ${rampProcess.id}`);

    console.log("📝 Step 4: Starting onramp...");
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
  } catch (error) {
    console.error("❌ Error in MXN Onramp Example:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runMxnOnrampExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
