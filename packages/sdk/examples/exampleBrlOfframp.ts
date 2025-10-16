import { EvmToken, EvmTransactionData, FiatToken, Networks, RampDirection } from "@packages/shared";
import * as readline from "readline";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

async function runBrlOfframpExample() {
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
    console.log("Starting BRL Offramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: "http://localhost:3000",
      autoReconnect: true, // 'wss://custom-moonbeam-rpc.com',
      // Optional: provide custom WebSocket URLs
      moonbeamWsUrl: undefined, // 'wss://custom-pendulum-rpc.com',
      pendulumWsUrl: undefined, // default is `true`
      // Optional: store ephemeral keys for debug
      storeEphemeralKeys: false // default is `false`
    };

    const sdk = new VortexSdk(config);
    console.log("⏳ Waiting for API initialization...");
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for BRL offramp...");
    const quoteRequest = {
      from: Networks.Polygon,
      inputAmount: "1",
      inputCurrency: EvmToken.USDC,
      network: Networks.Polygon,
      outputCurrency: FiatToken.BRL,
      rampType: RampDirection.SELL,
      to: "pix" as const
    };

    const quote = await sdk.createQuote(quoteRequest);
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const brlOfframpData = {
      pixDestination: "123.456.789-00",
      receiverTaxId: "123.456.789-00",
      taxId: "123.456.789-00",
      walletAddress: "0x1234567890123456789012345678901234567890"
    };

    const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, brlOfframpData);

    console.log("✅ BRL Offramp registered successfully:");
    console.log(`   Ramp ID: ${rampProcess.id}`);

    // The unsignedTransactions object will always return the transactions the user must sign and broadcast, please check the docs for more information https://api-docs.vortexfinance.co/vortex-sdk-1289458m0.
    console.log("   Unsigned transactions:");
    unsignedTransactions.forEach(tx => {
      const { to, data, value } = tx.txData as EvmTransactionData;
      console.log(`     - ${tx.phase}: Send to ${to} data ${data} with value ${value}`);
    });
    console.log("");

    console.log(
      "\n🛑 Complete the token payment on-chain now. Execute the transactions shown above (squidRouterApprove and squidRouterSwap), and save the corresponding transaction hashes."
    );

    const squidRouterApproveHash = await askQuestion("➡️  Enter the Squid Router Approve Hash: ");
    const squidRouterSwapHash = await askQuestion("➡️  Enter the Squid Router Swap Hash: ");

    console.log("\n📝 Step 4: Updating BRL offramp...");
    const transactionHashes = {
      squidRouterApproveHash,
      squidRouterSwapHash
    };

    await sdk.updateRamp(quote, rampProcess.id, transactionHashes);
    console.log("✅ BRL Offramp updated successfully.");

    await sdk.startRamp(rampProcess.id);
    console.log("✅ Offramp started successfully.");
  } catch (error) {
    console.error("❌ Error in BRL Offramp Example:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  }
}

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
