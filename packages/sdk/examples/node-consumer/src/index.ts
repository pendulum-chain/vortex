import "dotenv/config";

import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection, VortexSdk, type VortexSdkConfig } from "@vortexfi/sdk";

type Command = "check" | "quote" | "ramp-info" | "status";

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing ${name}. Set it in .env or the process environment.`);
  return value;
}

function readCommand(): Command {
  const command = process.argv[2] ?? "check";
  if (command === "check" || command === "quote" || command === "ramp-info" || command === "status") return command;
  throw new Error(`Unknown command: ${command}`);
}

function createSdk(): VortexSdk {
  const secretKey = optionalEnv("VORTEX_SECRET_KEY");
  const accessToken = optionalEnv("VORTEX_ACCESS_TOKEN");
  if (secretKey && accessToken) {
    throw new Error("Set only VORTEX_SECRET_KEY or VORTEX_ACCESS_TOKEN so the tested authentication path is explicit.");
  }

  const config: VortexSdkConfig = {
    apiBaseUrl: optionalEnv("VORTEX_API_URL") ?? "https://api-sandbox.vortexfinance.co",
    publicKey: optionalEnv("VORTEX_PUBLIC_KEY"),
    secretKey,
    storeEphemeralKeys: false
  };
  if (accessToken) config.accessTokenProvider = async () => accessToken;
  return new VortexSdk(config);
}

function printLocalPackage(): void {
  const require = createRequire(import.meta.url);
  const entry = realpathSync(require.resolve("@vortexfi/sdk"));
  if (!entry.endsWith("/packages/sdk/dist/index.js")) {
    throw new Error(`Expected the linked local SDK Node artifact, resolved ${entry}`);
  }

  console.log(`Node runtime: ${process.version}`);
  console.log(`Local SDK artifact: ${entry}`);
}

async function main(): Promise<void> {
  const command = readCommand();
  printLocalPackage();

  if (command === "check") {
    new VortexSdk({
      apiBaseUrl: "https://api-sandbox.vortexfinance.co",
      secretKey: "sk_test_node-construction-check",
      storeEphemeralKeys: false
    });
    console.log("Node accepted the SDK's server-side secret-key configuration.");
    console.log("No API request was made.");
    return;
  }

  const sdk = createSdk();
  if (command === "quote") {
    const quote = await sdk.createQuote({
      from: EPaymentMethod.PIX,
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.BSC,
      outputCurrency: EvmToken.USDC,
      rampType: RampDirection.BUY,
      to: Networks.BSC
    });
    console.log({
      expiresAt: quote.expiresAt,
      fees: `${quote.totalFeeFiat} ${quote.feeCurrency}`,
      input: `${quote.inputAmount} ${quote.inputCurrency}`,
      output: `${quote.outputAmount} ${quote.outputCurrency}`,
      quoteId: quote.id
    });
    return;
  }

  if (command === "ramp-info") {
    if (optionalEnv("VORTEX_ACCESS_TOKEN")) {
      throw new Error("ramp-info accepts API credentials, not Supabase Bearer authentication.");
    }
    if (!optionalEnv("VORTEX_PUBLIC_KEY") && !optionalEnv("VORTEX_SECRET_KEY")) {
      throw new Error("ramp-info requires VORTEX_PUBLIC_KEY or VORTEX_SECRET_KEY.");
    }
    console.log(await sdk.getRampInfo());
    return;
  }

  console.log(await sdk.getRampStatus(requireEnv("RAMP_ID")));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
