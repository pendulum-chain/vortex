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

task("deploy-settlement", "Deploy a per-user settlement contract from the configured factory")
  .addOptionalPositionalParam("recipient", "Ethereum mint recipient address")
  .setAction(async ({ recipient }, hre) => {
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
