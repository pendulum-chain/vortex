import { Account, Chain, createPublicClient, createWalletClient, http, PublicClient, WalletClient } from "viem";
import { moonbeam, polygon } from "viem/chains";
import logger from "../../../config/logger";
import { ALCHEMY_API_KEY } from "../../../constants/constants";

// So far we only support (and need) Polygon and Moonbeam as EVM networks.
export type EvmNetwork = "polygon" | "moonbeam";

export interface EvmNetworkConfig {
  name: EvmNetwork;
  chain: Chain;
  rpcUrl?: string;
}

const EVM_NETWORKS: EvmNetworkConfig[] = [
  {
    chain: polygon,
    name: "polygon",
    rpcUrl: ALCHEMY_API_KEY ? `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : undefined
  },
  {
    chain: moonbeam,
    name: "moonbeam"
    // No custom RPC URL for Moonbeam, always using default from viem
  }
];

export class EvmClientManager {
  private static instance: EvmClientManager;
  private clientInstances: Map<string, PublicClient> = new Map();
  private walletClientInstances: Map<string, WalletClient> = new Map(); // We keep a map of clients for each account on each network.
  private networks: EvmNetworkConfig[] = [];

  private constructor() {
    this.networks = EVM_NETWORKS;
  }

  public static getInstance(): EvmClientManager {
    if (!EvmClientManager.instance) {
      EvmClientManager.instance = new EvmClientManager();
    }
    return EvmClientManager.instance;
  }

  private getNetworkConfig(networkName: EvmNetwork): EvmNetworkConfig {
    const network = this.networks.find(n => n.name === networkName);
    if (!network) {
      throw new Error(`Network ${networkName} not configured`);
    }
    return network;
  }

  private createClient(networkName: EvmNetwork): PublicClient {
    const network = this.getNetworkConfig(networkName);

    const transport = network.rpcUrl ? http(network.rpcUrl) : http(); // Uses default RPC from chain config

    const client = createPublicClient({
      chain: network.chain,
      transport
    });

    return client;
  }

  private generateWalletClientKey(networkName: EvmNetwork, accountAddress: string): string {
    return `${networkName}-${accountAddress.toLowerCase()}`;
  }

  private createWalletClient(networkName: EvmNetwork, account: Account): WalletClient {
    const network = this.getNetworkConfig(networkName);

    const transport = network.rpcUrl ? http(network.rpcUrl) : http(); // Uses default RPC from chain config

    const walletClient = createWalletClient({
      account,
      chain: network.chain,
      transport
    });

    return walletClient;
  }

  public getClient(networkName: EvmNetwork): PublicClient {
    let client = this.clientInstances.get(networkName);

    if (!client) {
      logger.info(`Creating new EVM client for ${networkName}`);
      client = this.createClient(networkName);
      this.clientInstances.set(networkName, client);
    }

    return client;
  }

  public getWalletClient(networkName: EvmNetwork, account: Account): WalletClient {
    const key = this.generateWalletClientKey(networkName, account.address);
    let walletClient = this.walletClientInstances.get(key);

    if (!walletClient) {
      logger.info(`Creating new EVM wallet client for ${networkName} with account ${account.address}`);
      walletClient = this.createWalletClient(networkName, account);
      this.walletClientInstances.set(key, walletClient);
    }

    return walletClient;
  }

  // For initializing the public clients on application startup
  public getAllClients(): Map<string, PublicClient> {
    this.networks.forEach(network => {
      if (!this.clientInstances.has(network.name)) {
        this.getClient(network.name);
      }
    });

    return this.clientInstances;
  }
}
