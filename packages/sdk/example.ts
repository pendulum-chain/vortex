import { DestinationType, EvmToken, FiatToken, Networks } from "@packages/shared";
import type { BrlaOnrampAdditionalData, PaymentMethod, VortexSdkConfig } from "./src/types";
import { VortexSdk } from "./src/VortexSdk";

async function runBrlaOnrampExample() {
  try {
    console.log("Starting BRLA Onramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: "http://localhost:3000"
      // Optional: provide custom WebSocket URLs
      // pendulumWsUrl: 'wss://custom-pendulum-rpc.com',
      // moonbeamWsUrl: 'wss://custom-moonbeam-rpc.com',
      // autoReconnect: true, // default is true
    };

    const sdk = new VortexSdk(config);

    console.log("⏳ Waiting for API initialization...");
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for BRLA onramp...");
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

    const brlaOnrampData = {
      destinationAddress: "0x1234567890123456789012345678901234567890",
      taxId: "123.456.789-00"
    };

    const registeredRamp = await sdk.registerRamp(quote, brlaOnrampData);

    if (registeredRamp.depositQrCode) {
      console.log(`   Deposit QR Code: ${registeredRamp.depositQrCode}`);
    }
    // Step 4: Start the BRLA onramp process AFTER PAYMENT
    console.log("📝 Step 4: Starting BRLA onramp...");
    //const startedRamp = await sdk.startBrlaOnramp(registeredRamp.id);

    // Step 5: Monitor ramp status (optional)
    // console.log('📝 Step 5: Checking ramp status...');
    // const rampStatus = await sdk.getRampStatus(startedRamp.id);
    // console.log('✅ Current ramp status:');
    // console.log(`   Phase: ${rampStatus.currentPhase}`);
    // console.log(`   Unsigned transactions: ${rampStatus.unsignedTxs.length}`);
  } catch (error) {
    console.error("❌ Error in BRLA Onramp Example:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runBrlaOnrampExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
