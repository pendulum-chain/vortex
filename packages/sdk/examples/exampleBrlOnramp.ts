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

async function runBrlOnrampExample() {
  try {
    console.log("Starting BRL Onramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: process.env.VORTEX_API_URL ?? "http://localhost:3000",
      autoReconnect: true,
      // Optional: provide custom WebSocket URLs
      moonbeamWsUrl: undefined,
      pendulumWsUrl: undefined, // 'wss://custom-moonbeam-rpc.com',
      publicKey: requireEnv("VORTEX_PUBLIC_KEY"), // 'wss://custom-pendulum-rpc.com',
      secretKey: requireEnv("VORTEX_SECRET_KEY"), // default is `true`
      // Optional: store ephemeral keys for later use
      storeEphemeralKeys: true // default is `true`
    };

    const sdk = new VortexSdk(config);

    console.log("⏳ Waiting for API initialization...");
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for BRL onramp...");
    const quoteRequest: CreateQuoteRequest = {
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Polygon,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Polygon
      //partnerId: "example-partner"
    };

    const quote = (await sdk.createQuote(quoteRequest)) as QuoteResponse;
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const brlOnrampData = {
      destinationAddress: requireEnv("DESTINATION_ADDRESS"),
      taxId: requireEnv("BRL_TAX_ID")
    };

    const { rampProcess } = await sdk.registerRamp(quote, brlOnrampData);

    console.log("✅ BRL Onramp registered successfully:");
    console.log(`   Ramp ID: ${rampProcess.id}`);

    if (rampProcess.depositQrCode) {
      console.log(`   Deposit QR Code: ${rampProcess.depositQrCode}`);
    }

    // Step 4: Start the BRL onramp process AFTER PAYMENT
    console.log("📝 Step 4: Starting BRL onramp...");

    // Ensure making the payment BEFORE starting the ramp
    const _startedRamp = await sdk.startRamp(rampProcess.id);
  } catch (error) {
    console.error("❌ Error in BRL Onramp Example:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runBrlOnrampExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
