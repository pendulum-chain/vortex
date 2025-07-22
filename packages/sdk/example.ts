import { EvmToken, FiatToken, Networks } from "@packages/shared";
import { VortexSdkConfig } from "./src/types";
import { VortexSdk } from "./src/VortexSdk";

async function runBrlOnrampExample() {
  try {
    console.log("Starting BRL Onramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: "http://localhost:3000",
      autoReconnect: true, // 'wss://custom-moonbeam-rpc.com',
      // Optional: provide custom WebSocket URLs
      moonbeamWsUrl: undefined, // 'wss://custom-pendulum-rpc.com',
      pendulumWsUrl: undefined, // default is `true`
      // Optional: store ephemeral keys for later use
      storeEphemeralKeys: false // default is `false`
    };

    const sdk = new VortexSdk(config);

    console.log("⏳ Waiting for API initialization...");
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for BRL onramp...");
    const quoteRequest = {
      from: "pix" as const,
      inputAmount: "1",
      inputCurrency: FiatToken.BRL,
      outputCurrency: EvmToken.USDC,
      rampType: "on" as const,
      to: Networks.Polygon
      //partnerId: "example-partner"
    };

    const quote = await sdk.createQuote(quoteRequest);
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Fee: ${quote.fee}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const brlOnrampData = {
      destinationAddress: "0x1234567890123456789012345678901234567890",
      taxId: "123.456.789-00"
    };

    const registeredRamp = await sdk.registerRamp(quote, brlOnrampData);

    if (registeredRamp.depositQrCode) {
      console.log(`   Deposit QR Code: ${registeredRamp.depositQrCode}`);
    }
    // Step 4: Start the BRL onramp process AFTER PAYMENT
    console.log("📝 Step 4: Starting BRL onramp...");

    // Ensure making the payment BEFORE starting the ramp
    const startedRamp = await sdk.startRamp(quote, registeredRamp.id);
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
