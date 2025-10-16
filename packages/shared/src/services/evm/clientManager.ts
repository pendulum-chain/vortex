import { ALCHEMY_API_KEY, EvmNetworks, MOONBEAM_WSS, Networks } from "@packages/shared";
import { Account, Chain, createPublicClient, createWalletClient, http, PublicClient, Transport, WalletClient } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, moonbeam, polygon } from "viem/chains";
import logger from "../../logger";

export interface EvmNetworkConfig {
  name: EvmNetworks;
  chain: Chain;
  rpcUrls: string[];
}

function getEvmNetworks(apiKey?: string): EvmNetworkConfig[] {
  return [
    {
      chain: polygon,
      name: Networks.Polygon,
      rpcUrls: apiKey ? [`https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: moonbeam,
      name: Networks.Moonbeam,
      rpcUrls: apiKey ? [`https://moonbeam-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: arbitrum,
      name: Networks.Arbitrum,
      rpcUrls: apiKey ? [`https://arb-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: avalanche,
      name: Networks.Avalanche,
      rpcUrls: apiKey ? [`https://avax-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: base,
      name: Networks.Base,
      rpcUrls: apiKey ? [`https://base-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: bsc,
      name: Networks.BSC,
      rpcUrls: apiKey ? [`https://bnb-mainnet.g.alchemy.com/v2/${apiKey}`] : []
    },
    {
      chain: mainnet,
      name: Networks.Ethereum,
      rpcUrls: apiKey ? [`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`] : []
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
    // Pre-create all public clients for all RPCs
    this.networks.forEach(network => {
      network.rpcUrls.forEach(rpcUrl => {
        const client = this.createClient(network.name, rpcUrl);
        const key = this.generatePublicClientKey(network.name, rpcUrl);
        this.clientInstances.set(key, client);
        logger.current.info(`Pre-created EVM client for ${network.name} with RPC: ${rpcUrl}`);
      });
    });
  }

  public static getInstance(): EvmClientManager {
    if (!EvmClientManager.instance) {
      EvmClientManager.instance = new EvmClientManager();
    }
    return EvmClientManager.instance;
  }

  private generatePublicClientKey(networkName: EvmNetworks, rpcUrl: string): string {
    return `${networkName}-${rpcUrl}`;
  }

  private getNetworkConfig(networkName: EvmNetworks): EvmNetworkConfig {
    const network = this.networks.find(n => n.name === networkName);
    if (!network) {
      throw new Error(`Network ${networkName} not configured`);
    }
    return network;
  }

  // Will create a new client for the given network and RPC URL. By default, uses the first RPC URL if none specified.
  private createClient(networkName: EvmNetworks, rpcUrl?: string): PublicClient {
    const network = this.getNetworkConfig(networkName);

    const transport = rpcUrl ? http(rpcUrl) : network.rpcUrls.length > 0 ? http(network.rpcUrls[0]) : http();

    const client = createPublicClient({
      chain: network.chain,
      transport
    });

    return client;
  }

  private generateWalletClientKey(networkName: EvmNetworks, accountAddress: string, rpcUrl?: string): string {
    const rpcSuffix = rpcUrl ? `-${rpcUrl}` : "";
    return `${networkName}-${accountAddress.toLowerCase()}${rpcSuffix}`;
  }

  private createWalletClient(
    networkName: EvmNetworks,
    account: Account,
    rpcUrl?: string
  ): WalletClient<Transport, Chain, Account> {
    const network = this.getNetworkConfig(networkName);

    const transport = rpcUrl ? http(rpcUrl) : network.rpcUrls.length > 0 ? http(network.rpcUrls[0]) : http();

    const walletClient = createWalletClient({
      account,
      chain: network.chain,
      transport
    });

    return walletClient;
  }

  public getClient(networkName: EvmNetworks, rpcUrl?: string): PublicClient {
    const network = this.getNetworkConfig(networkName);

    // If no RPC specified, use the first one
    const targetRpcUrl = rpcUrl || network.rpcUrls[0];
    const key = this.generatePublicClientKey(networkName, targetRpcUrl);
    const client = this.clientInstances.get(key);

    if (!client) {
      throw new Error(`Client for ${networkName} with RPC ${targetRpcUrl} not found. This should not happen.`);
    }

    return client;
  }

  public getWalletClient(networkName: EvmNetworks, account: Account, rpcUrl?: string): WalletClient<Transport, Chain, Account> {
    const key = this.generateWalletClientKey(networkName, account.address, rpcUrl);
    let walletClient = this.walletClientInstances.get(key);

    if (!walletClient) {
      logger.current.info(
        `Creating new EVM wallet client for ${networkName} with account ${account.address}${rpcUrl ? ` using RPC: ${rpcUrl}` : ""}`
      );
      walletClient = this.createWalletClient(networkName, account, rpcUrl);
      this.walletClientInstances.set(key, walletClient);
    }

    return walletClient;
  }

  /**
   * Sends a transaction with blind retry logic using exponential backoff and RPC switching.
   * This method should be used for idempotent operations where retrying is safe.
   *
   * @param networkName - The EVM network to send the transaction on
   * @param account - The account to send the transaction from
   * @param transactionParams - The transaction parameters (data, to, value, maxFeePerGas, etc.)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @param initialDelayMs - Initial delay in milliseconds before first retry (default: 1000)
   * @returns Transaction hash
   */
  public async sendTransactionWithBlindRetry(
    networkName: EvmNetworks,
    account: Account,
    transactionParams: {
      data?: `0x${string}`;
      to: `0x${string}`;
      value?: bigint;
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
      gas?: bigint;
      nonce?: number;
    },
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<string> {
    const network = this.getNetworkConfig(networkName);
    const rpcUrls = network.rpcUrls;

    if (rpcUrls.length === 0) {
      throw new Error(`No RPC URLs configured for network ${networkName}`);
    }

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      // Select a random RPC URL
      const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];

      try {
        logger.current.info(
          `Attempt ${attempt + 1}/${maxRetries + 1} to send transaction on ${networkName} using RPC: ${rpcUrl}`
        );

        // Use wallet client from cache (or create if needed) for the selected RPC
        const walletClient = this.getWalletClient(networkName, account, rpcUrl);

        const hash = await walletClient.sendTransaction(transactionParams);

        logger.current.info(`Transaction sent successfully on ${networkName} with hash: ${hash} (attempt ${attempt + 1})`);

        return hash;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.current.warn(
          `Transaction attempt ${attempt + 1}/${maxRetries + 1} failed on ${networkName} with RPC ${rpcUrl}: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          const delayMs = initialDelayMs * Math.pow(2, attempt);

          logger.current.info(`Retrying in ${delayMs}ms... (${maxRetries - attempt} retries remaining)`);

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        attempt++;
      }
    }

    throw new Error(
      `Failed to send transaction on ${networkName} after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`
    );
  }
}
