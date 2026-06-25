import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const RAW_PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVATE_KEY = RAW_PRIVATE_KEY ? (RAW_PRIVATE_KEY.startsWith("0x") ? RAW_PRIVATE_KEY : `0x${RAW_PRIVATE_KEY}`) : undefined;

function getRequiredAddress(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid EVM address`);
  }

  return value;
}

function getOptionalAddress(value: string | undefined, name: string) {
  if (!value) {
    return undefined;
  }

  return getRequiredAddress(value, name);
}

function getRequiredValue(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parseUint32(value: string, name: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an unsigned integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 2 ** 32 - 1) {
    throw new Error(`${name} must fit in uint32`);
  }

  return parsed;
}

function getIrisApiBaseUrl(networkName: string) {
  return networkName === "baseSepolia" || networkName === "hardhat"
    ? "https://iris-api-sandbox.circle.com"
    : "https://iris-api.circle.com";
}

type CctpFeeTier = "low" | "medium" | "med" | "high";

type CctpFeeQuote = {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee?: Partial<Record<CctpFeeTier, number | string>>;
};

function isCctpFeeQuote(value: unknown): value is CctpFeeQuote {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return typeof candidate.finalityThreshold === "number" && typeof candidate.minimumFee === "number";
}

function getForwardFee(quote: CctpFeeQuote, tier: CctpFeeTier) {
  const forwardFee = quote.forwardFee;
  if (!forwardFee) {
    throw new Error("Circle fee quote did not include forwardFee; ensure the request uses forward=true");
  }

  const normalizedTier = tier === "med" ? "medium" : tier;
  const fee = forwardFee[normalizedTier] ?? (normalizedTier === "medium" ? forwardFee.med : undefined);

  if (fee === undefined) {
    throw new Error(`Circle fee quote did not include forwardFee.${normalizedTier}`);
  }

  return BigInt(fee);
}

async function quoteCctpMaxFee(networkName: string, usdcAmount: bigint, minFinalityThreshold: number, feeTier: CctpFeeTier) {
  const sourceDomain = 6;
  const destinationDomain = 0;
  const feesUrl = `${getIrisApiBaseUrl(networkName)}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}?forward=true`;

  const response = await fetch(feesUrl, { headers: { "Content-Type": "application/json" } });
  if (!response.ok) {
    throw new Error(`Circle fee request failed with HTTP ${response.status}: ${await response.text()}`);
  }

  const feeQuotes = (await response.json()) as unknown;
  if (!Array.isArray(feeQuotes)) {
    throw new Error("Circle fee response was not an array");
  }

  const quote = feeQuotes.filter(isCctpFeeQuote).find(item => item.finalityThreshold === minFinalityThreshold);
  if (!quote) {
    throw new Error(`Circle fee response did not include finalityThreshold ${minFinalityThreshold}`);
  }

  const forwardFee = getForwardFee(quote, feeTier);
  const protocolFee = (usdcAmount * BigInt(Math.round(quote.minimumFee * 100))) / 1_000_000n;

  return { feesUrl, forwardFee, maxFee: forwardFee + protocolFee, protocolFee };
}

task("deploy-settlement", "Deploy a per-user settlement contract from the configured factory")
  .addOptionalPositionalParam("recipient", "Ethereum mint recipient address")
  .setAction(async ({ recipient }, hre) => {
    await hre.run("compile");

    const factoryAddress = getRequiredAddress(process.env.SETTLEMENT_FACTORY_ADDRESS, "SETTLEMENT_FACTORY_ADDRESS");
    const ethereumMintRecipient = getRequiredAddress(
      recipient || process.env.ETHEREUM_MINT_RECIPIENT,
      "ETHEREUM_MINT_RECIPIENT"
    );

    const factory = await hre.ethers.getContractAt("PerUserCctpSettlementFactory", factoryAddress);
    const tx = await factory.deploySettlement(ethereumMintRecipient);

    console.log("Deployment tx:", tx.hash);

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction was not mined");
    }

    for (const log of receipt.logs) {
      try {
        const parsedLog = factory.interface.parseLog(log);

        if (parsedLog?.name === "SettlementDeployed") {
          console.log("Settlement address:", parsedLog.args.settlement);
          console.log("Ethereum mint recipient:", parsedLog.args.ethereumMintRecipient);
          return;
        }
      } catch (error) {
        void error;
        continue;
      }
    }

    throw new Error("SettlementDeployed event not found in transaction receipt");
  });

task("sweep-usdc", "Sweep USDC from a deployed settlement contract through CCTP forwarding")
  .addOptionalPositionalParam("settlement", "PerUserCctpSettlement contract address")
  .addOptionalParam("amount", "USDC amount to burn, in decimal USDC units")
  .addOptionalParam("maxFee", "CCTP maxFee in raw USDC subunits; if omitted, Circle's forwarding fee API is used")
  .addOptionalParam("finality", "CCTP minFinalityThreshold", process.env.CCTP_MIN_FINALITY_THRESHOLD || "2000")
  .addOptionalParam("feeTier", "Forwarding fee tier: low, medium/med, or high", process.env.CCTP_FEE_TIER || "medium")
  .setAction(async ({ amount, feeTier, finality, maxFee, settlement }, hre) => {
    await hre.run("compile");

    const settlementAddress = getRequiredAddress(
      getOptionalAddress(settlement, "settlement") || process.env.SETTLEMENT_ADDRESS,
      "SETTLEMENT_ADDRESS"
    );
    const usdcAmount = hre.ethers.parseUnits(getRequiredValue(amount || process.env.SWEEP_USDC_AMOUNT, "SWEEP_USDC_AMOUNT"), 6);
    const minFinalityThreshold = parseUint32(finality, "minFinalityThreshold");
    const normalizedFeeTier = (feeTier === "med" ? "medium" : feeTier) as CctpFeeTier;

    if (!["low", "medium", "high"].includes(normalizedFeeTier)) {
      throw new Error("feeTier must be one of: low, medium, med, high");
    }

    let resolvedMaxFee: bigint;

    if (maxFee || process.env.CCTP_MAX_FEE) {
      resolvedMaxFee = BigInt(maxFee || process.env.CCTP_MAX_FEE || "0");
      console.log("Using explicit maxFee:", resolvedMaxFee.toString(), "raw USDC subunits");
    } else {
      const quote = await quoteCctpMaxFee(hre.network.name, usdcAmount, minFinalityThreshold, normalizedFeeTier);
      resolvedMaxFee = quote.maxFee;

      console.log("Circle fee URL:", quote.feesUrl);
      console.log("Forwarding fee:", quote.forwardFee.toString(), "raw USDC subunits");
      console.log("Protocol fee:", quote.protocolFee.toString(), "raw USDC subunits");
      console.log("Resolved maxFee:", resolvedMaxFee.toString(), "raw USDC subunits");
    }

    const settlementContract = await hre.ethers.getContractAt("PerUserCctpSettlement", settlementAddress);

    console.log("Settlement:", settlementAddress);
    console.log("Burn amount:", usdcAmount.toString(), "raw USDC subunits");
    console.log("Minimum finality threshold:", minFinalityThreshold);

    const tx = await settlementContract.sweepUsdc(usdcAmount, resolvedMaxFee, minFinalityThreshold);
    console.log("Sweep tx:", tx.hash);

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction was not mined");
    }

    console.log("Sweep confirmed in block:", receipt.blockNumber);
  });

const config: HardhatUserConfig = {
  networks: {
    base: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 8453,
      url: process.env.BASE_RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    baseSepolia: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 84532,
      url: process.env.BASE_SEPOLIA_RPC_URL || `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    hardhat: {
      chainId: 84532
    }
  },
  solidity: {
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    },
    version: "0.8.28"
  }
};

export default config;
