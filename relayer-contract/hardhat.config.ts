import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  networks: {
    amoy: {
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80002,
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"
    },
    arbitrum: {
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161,
      url: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc"
    },
    base: {
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org"
    },
    hardhat: {
      chainId: 80002
    },
    polygon: {
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 137,
      url: process.env.POLYGON_RPC_URL || "https://polygon.drpc.org"
    }
  },
  solidity: {
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    },
    version: "0.8.20"
  }
};

export default config;
