import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const RAW_PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVATE_KEY = RAW_PRIVATE_KEY ? (RAW_PRIVATE_KEY.startsWith("0x") ? RAW_PRIVATE_KEY : `0x${RAW_PRIVATE_KEY}`) : undefined;

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
