import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const RAW_PRIVATE_KEY = process.env.PRIVATE_KEY;
const PRIVATE_KEY = RAW_PRIVATE_KEY ? (RAW_PRIVATE_KEY.startsWith("0x") ? RAW_PRIVATE_KEY : `0x${RAW_PRIVATE_KEY}`) : undefined;

const config: HardhatUserConfig = {
  networks: {
    amoy: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002,
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"
    },
    arbitrum: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 42161,
      url: process.env.ARBITRUM_RPC_URL || `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    avalanche: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 43114,
      url: process.env.AVALANCHE_RPC_URL || `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    base: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 8453,
      url: process.env.BASE_RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    bsc: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 56,
      url: process.env.BSC_RPC_URL || `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    ethereum: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 1,
      url: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
    },
    hardhat: {
      chainId: 80002
    },
    polygon: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 137,
      url: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "demo"}`
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
