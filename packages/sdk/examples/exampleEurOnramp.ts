import { CreateQuoteRequest, EPaymentMethod, EvmToken, FiatToken, Networks, QuoteResponse, RampDirection } from "../src/index";
import { VortexSdkConfig } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

async function runEurOnrampExample() {
  try {
    console.log("Starting EUR Onramp Example...\n");

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

    console.log("📝 Step 2: Creating quote for EUR onramp (EUR via SEPA -> USDC on Base)...");
    const quoteRequest: CreateQuoteRequest = {
      from: EPaymentMethod.SEPA,
      inputAmount: "100",
      inputCurrency: FiatToken.EURC,
      network: Networks.Base,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.Base
    };

    const quote = (await sdk.createQuote(quoteRequest)) as QuoteResponse;
    console.log("✅ Quote created successfully:");
    console.log(`   Quote ID: ${quote.id}`);
    console.log(`   Input: ${quote.inputAmount} ${quote.inputCurrency}`);
    console.log(`   Output: ${quote.outputAmount} ${quote.outputCurrency}`);
    console.log(`   Total Fee: ${quote.totalFeeFiat} ${quote.feeCurrency}`);
    console.log(`   Expires at: ${quote.expiresAt}\n`);

    const eurOnrampData = {
      destinationAddress: "0x1234567890123456789012345678901234567890",
      email: "user@example.com",
      ipAddress: "203.0.113.1"
    };

    console.log("📝 Step 3: Registering EUR onramp...");
    const { rampProcess } = await sdk.registerRamp(quote, eurOnrampData);

    console.log("✅ EUR Onramp registered successfully:");
    console.log(`   Ramp ID: ${rampProcess.id}`);

    // IBAN payment instructions are returned in rampProcess.ibanPaymentData after registration.
    // The user must complete the SEPA transfer before starting the ramp.
    if (rampProcess.ibanPaymentData) {
      console.log("   IBAN Payment Instructions:");
      console.log(`     IBAN: ${rampProcess.ibanPaymentData.iban}`);
      console.log(`     Receiver: ${rampProcess.ibanPaymentData.receiverName}`);
      console.log(`     Reference: ${rampProcess.ibanPaymentData.reference}`);
    }

    // Step 4: Start the ramp AFTER making the SEPA payment
    console.log("\n📝 Step 4: Starting EUR onramp (ensure SEPA payment is completed first)...");
    await sdk.startRamp(rampProcess.id);
    console.log("✅ EUR Onramp started.");
  } catch (error) {
    console.error("❌ Error in EUR Onramp Example:", error);

    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  runEurOnrampExample()
    .then(() => {
      console.log("\n✨ Example execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Example execution failed:", error);
      process.exit(1);
    });
}
