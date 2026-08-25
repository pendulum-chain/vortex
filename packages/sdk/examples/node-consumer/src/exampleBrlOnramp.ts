import "dotenv/config";

import {
  CreateQuoteRequest,
  EPaymentMethod,
  EvmToken,
  FiatToken,
  Networks,
  QuoteResponse,
  RampDirection,
  VortexSdk,
  VortexSdkConfig
} from "@vortexfi/sdk";

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
      publicKey: process.env.VORTEX_PUBLIC_KEY?.trim() || undefined, // 'wss://custom-pendulum-rpc.com',
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
      inputAmount: "5",
      inputCurrency: FiatToken.BRL,
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

    const brlOnrampData = {
      destinationAddress: requireEnv("DESTINATION_ADDRESS")
    };

    const { rampProcess } = await sdk.registerRamp(quote, brlOnrampData);

    console.log("✅ BRL Onramp registered successfully:");
    console.log(`   Ramp ID: ${rampProcess.id}`);

    if (rampProcess.depositQrCode) {
      console.log(`   Deposit QR Code: ${rampProcess.depositQrCode}`);
    }

    console.log("Complete the PIX payment before calling sdk.startRamp(rampProcess.id).");
  } catch (error) {
    console.error("❌ Error in BRL Onramp Example:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    process.exit(1);
  }
}

runBrlOnrampExample()
  .then(() => {
    console.log("\n✨ Example execution completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("\n💥 Example execution failed:", error);
    process.exit(1);
  });
