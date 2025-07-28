import { EvmToken, FiatToken, Networks } from "@packages/shared";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

async function runBrlOfframpExample() {
  try {
    console.log("Starting BRL Offramp Example...\n");

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
      from: Networks.Polygon,
      inputAmount: "1",
      inputCurrency: EvmToken.USDC,
      outputCurrency: FiatToken.BRL,
      rampType: "off" as const,
      to: "pix" as const
      //partnerId: "example-partner"
    };

    const quote = await sdk.createQuote(quoteRequest);
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Fee: ${quote.fee}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const brlOfframpData = {
      pixDestination: "123.456.789-00",
      receiverTaxId: "123.456.789-00",
      taxId: "123.456.789-00",
      walletAddress: "0x1234567890123456789012345678901234567890"
    };

    const registeredRamp = await sdk.registerRamp(quote, brlOfframpData);

    // Step 4: Update and start the BRL offramp process AFTER MAKING THE TOKEN PAYMENT.
    console.log("📝 Step 4: Updating BRL offramp...");
    const transactionHashes = {
      squidRouterApproveHash: "0x",
      squidRouterSwapHash: "0x"
      //assetHubToPendulumHash: "0x"
    };

    await sdk.updateRamp(quote, registeredRamp.id, transactionHashes);
    console.log("✅ BRL Offramp updated successfully:");

    await sdk.startRamp(registeredRamp.id);
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
  runBrlOfframpExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
