import * as readline from "readline";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection } from "../src/index";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

async function runEurOfframpExample() {
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
    console.log("Starting EUR Offramp Example...\n");

    console.log("📝 Step 1: Initializing VortexSdk...");
    const config: VortexSdkConfig = {
      apiBaseUrl: "http://localhost:3000",
      autoReconnect: true,
      publicKey: "pk_live_REPLACEME",
      secretKey: "sk_live_REPLACEME",
      storeEphemeralKeys: true
    };

    const sdk = new VortexSdk(config);
    console.log("✅ VortexSdk initialized successfully\n");

    console.log("📝 Step 2: Creating quote for EUR offramp (USDC on Polygon -> EUR via SEPA)...");
    const quoteRequest = {
      from: Networks.Polygon,
      inputAmount: "100",
      inputCurrency: EvmToken.USDC,
      network: Networks.Polygon,
      outputCurrency: FiatToken.EURC,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.SEPA
    };

    const quote = await sdk.createQuote(quoteRequest);
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const eurOfframpData = {
      destinationAddress: "0x1234567890123456789012345678901234567890",
      email: "user@example.com",
      ipAddress: "203.0.113.1",
      walletAddress: "0x1234567890123456789012345678901234567890"
    };

    console.log("📝 Step 3: Registering EUR offramp...");
    const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, eurOfframpData);

    console.log("✅ EUR Offramp registered successfully:");
    console.log(`   Ramp ID: ${rampProcess.id}`);

    console.log("   Unsigned transactions:");
    unsignedTransactions.forEach(tx => {
      const txType = sdk.getUserTransactionType(tx);
      console.log(`     - ${tx.phase} (${txType}): signer ${tx.signer} on ${tx.network}`);
    });
    console.log("");

    console.log(
      "\n🛑 Complete the token payment on-chain now. Execute the transactions shown above (squidRouterApprove and squidRouterSwap), and save the corresponding transaction hashes."
    );

    const squidRouterApproveHash = await askQuestion("➡️  Enter the Squid Router Approve Hash: ");
    const squidRouterSwapHash = await askQuestion("➡️  Enter the Squid Router Swap Hash: ");

    console.log("\n📝 Step 4: Updating EUR offramp...");
    const transactionHashes = {
      squidRouterApproveHash,
      squidRouterSwapHash
    };

    await sdk.updateRamp(quote, rampProcess.id, transactionHashes);
    console.log("✅ EUR Offramp updated successfully.");

    console.log("\n📝 Step 5: Starting EUR offramp...");
    await sdk.startRamp(rampProcess.id);
    console.log("✅ EUR Offramp started successfully.");
  } catch (error) {
    console.error("❌ Error in EUR Offramp Example:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  runEurOfframpExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
