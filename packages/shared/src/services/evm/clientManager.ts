import { ALCHEMY_API_KEY, EvmNetworks, MOONBEAM_WSS, Networks } from "@packages/shared";
import {
  Account,
  Chain,
  createPublicClient,
  createWalletClient,
  http,
  PublicClient,
  Transport,
  WalletClient,
  webSocket
} from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, moonbeam, polygon } from "viem/chains";
import logger from "../../logger";

export interface EvmNetworkConfig {
  name: EvmNetworks;
  chain: Chain;
  rpcUrl?: string;
}

function getEvmNetworks(apiKey?: string): EvmNetworkConfig[] {
  return [
    {
      chain: polygon,
      name: Networks.Polygon,
      rpcUrl: apiKey ? `https://polygon-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    },
    {
      chain: moonbeam,
      name: Networks.Moonbeam,
      rpcUrl: MOONBEAM_WSS
    },
    {
      chain: arbitrum,
      name: Networks.Arbitrum,
      rpcUrl: apiKey ? `https://arb-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    },
    {
      chain: avalanche,
      name: Networks.Avalanche,
      rpcUrl: apiKey ? `https://avax-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    },
    {
      chain: base,
      name: Networks.Base,
      rpcUrl: apiKey ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    },
    {
      chain: bsc,
      name: Networks.BSC,
      rpcUrl: apiKey ? `https://bnb-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    },
    {
      chain: mainnet,
      name: Networks.Ethereum,
      rpcUrl: apiKey ? `https://eth-mainnet.g.alchemy.com/v2/${apiKey}` : undefined
    }
  ];
}

export class EvmClientManager {
  private static instance: EvmClientManager;
  private clientInstances: Map<string, PublicClient> = new Map();
  private walletClientInstances: Map<string, WalletClient<Transport, Chain, Account>> = new Map(); // We keep a map of clients for each account on each network.
  private networks: EvmNetworkConfig[] = [];

  private constructor() {
    this.networks = getEvmNetworks(ALCHEMY_API_KEY);
  }

  public static getInstance(): EvmClientManager {
    if (!EvmClientManager.instance) {
      EvmClientManager.instance = new EvmClientManager();
    }
    return EvmClientManager.instance;
  }

  private getNetworkConfig(networkName: EvmNetworks): EvmNetworkConfig {
    const network = this.networks.find(n => n.name === networkName);
    if (!network) {
      throw new Error(`Network ${networkName} not configured`);
    }
    return network;
  }

  private createClient(networkName: EvmNetworks): PublicClient {
    const network = this.getNetworkConfig(networkName);

    const transport = network.rpcUrl
      ? network.name === Networks.Moonbeam
        ? webSocket(MOONBEAM_WSS)
        : http(network.rpcUrl)
      : http();

    const client = createPublicClient({
      chain: network.chain,
      transport
    });

    return client;
  }

  private generateWalletClientKey(networkName: EvmNetworks, accountAddress: string): string {
    return `${networkName}-${accountAddress.toLowerCase()}`;
  }

  private createWalletClient(networkName: EvmNetworks, account: Account): WalletClient<Transport, Chain, Account> {
    const network = this.getNetworkConfig(networkName);

    // if moonbeam, provide websocket transport. If not, use http
    const transport = network.rpcUrl
      ? network.name === Networks.Moonbeam
        ? webSocket(network.rpcUrl)
        : http(network.rpcUrl)
      : http();
    const walletClient = createWalletClient({
      account,
      chain: network.chain,
      transport
    });

    return walletClient;
  }

  public getClient(networkName: EvmNetworks): PublicClient {
    let client = this.clientInstances.get(networkName);

    if (!client) {
      logger.current.info(`Creating new EVM client for ${networkName}`);
      client = this.createClient(networkName);
      this.clientInstances.set(networkName, client);
    }

    return client;
  }

  public getWalletClient(networkName: EvmNetworks, account: Account): WalletClient<Transport, Chain, Account> {
    const key = this.generateWalletClientKey(networkName, account.address);
    let walletClient = this.walletClientInstances.get(key);

    if (!walletClient) {
      logger.current.info(`Creating new EVM wallet client for ${networkName} with account ${account.address}`);
      walletClient = this.createWalletClient(networkName, account);
      this.walletClientInstances.set(key, walletClient);
    }

    return walletClient;
  }
}
