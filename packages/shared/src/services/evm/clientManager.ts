import { ALCHEMY_API_KEY, EvmNetworks, MOONBEAM_WSS, Networks } from "@packages/shared";
import { Account, Chain, createPublicClient, createWalletClient, http, PublicClient, Transport, WalletClient } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, moonbeam, polygon, polygonAmoy } from "viem/chains";
import logger from "../../logger";

export interface EvmNetworkConfig {
  name: EvmNetworks;
  chain: Chain;
  rpcUrls: string[];
}

function getEvmNetworks(apiKey?: string): EvmNetworkConfig[] {
  // Note on defining RPC URLs: '' is equal to viem's default RPC for that chain: http().
  return [
    {
      chain: polygon,
      name: Networks.Polygon,
      rpcUrls: apiKey ? [`https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    },
    {
      chain: polygonAmoy,
      name: Networks.PolygonAmoy,
      rpcUrls: ["https://polygon-amoy.api.onfinality.io/public", ""]
    },
    {
      chain: moonbeam,
      name: Networks.Moonbeam,
      rpcUrls: ["https://rpc.api.moonbeam.network", "https://moonbeam-rpc.publicnode.com", ""]
    },
    {
      chain: arbitrum,
      name: Networks.Arbitrum,
      rpcUrls: apiKey ? [`https://arb-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    },
    {
      chain: avalanche,
      name: Networks.Avalanche,
      rpcUrls: apiKey ? [`https://avax-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    },
    {
      chain: base,
      name: Networks.Base,
      rpcUrls: apiKey ? [`https://base-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    },
    {
      chain: bsc,
      name: Networks.BSC,
      rpcUrls: apiKey ? [`https://bnb-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    },
    {
      chain: mainnet,
      name: Networks.Ethereum,
      rpcUrls: apiKey ? [`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`, ""] : [""]
    }
  ];
}

export class EvmClientManager {
  private static instance: EvmClientManager;
  private clientInstances: Map<string, PublicClient> = new Map();
  private walletClientInstances: Map<string, WalletClient<Transport, Chain, Account>> = new Map();
  private networks: EvmNetworkConfig[] = [];

  /**
   * RPC selector that exhausts all URLs before repeating.
   * First cycle uses definition order (preferred RPCs first), subsequent cycles are shuffled.
   * Attempt 1-3: A → B → C (definition order)
   * Attempt 4-6: C → A → B (shuffled randomly)
   * Attempt 7-9: B → C → A (new shuffle)
   */
  private createRpcSelector(rpcUrls: string[]) {
    let pool = [...rpcUrls];
    let usedInCurrentCycle = new Set<string>();

    const shuffleArray = <T>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    return {
      getNext: (): string => {
        // If we've exhausted all RPCs, shuffle for next cycle
        if (usedInCurrentCycle.size === pool.length) {
          pool = shuffleArray(rpcUrls);
          usedInCurrentCycle.clear();
        }

        // Select the next RPC based on current index
        const selectedRpc = pool[usedInCurrentCycle.size];
        usedInCurrentCycle.add(selectedRpc);

        return selectedRpc;
      }
    };
  }

  /**
   * Generic retry wrapper with smart RPC selection and exponential backoff.
   * Exhausts all available RPCs before repeating selections.
   *
   * @param networkName - The network to operate on
   * @param operation - Async function that receives an RPC URL and returns a result
   * @param operationName - Name of the operation for logging
   * @param maxRetries - Maximum number of retry attempts
   * @param initialDelayMs - Initial delay before first retry
   * @returns Result of the operation
   */
  private async executeWithRetry<T>(
    networkName: EvmNetworks,
    operation: (rpcUrl: string) => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<T> {
    const network = this.getNetworkConfig(networkName);
    const rpcUrls = network.rpcUrls;

    if (rpcUrls.length === 0) {
      throw new Error(`No RPC URLs configured for network ${networkName}`);
    }

    const rpcSelector = this.createRpcSelector(rpcUrls);
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const rpcUrl = rpcSelector.getNext();

      try {
        const result = await operation(rpcUrl);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.current.warn(
          `${operationName} attempt ${attempt + 1}/${maxRetries + 1} failed on ${networkName} with RPC ${rpcUrl}: ${lastError.message}`
        );

        if (attempt < maxRetries) {
          const delayMs = initialDelayMs * Math.pow(2, attempt); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        attempt++;
      }
    }

    // TODO should we return the raw rpc error here, instead of just the message?
    throw new Error(
      `Failed to ${operationName} on ${networkName} after ${maxRetries + 1} attempts. Last error: ${lastError?.message}`
    );
  }

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

  private createClient(networkName: EvmNetworks, rpcUrl?: string): PublicClient {
    const network = this.getNetworkConfig(networkName);

    const transport = rpcUrl ? http(rpcUrl) : http(network.rpcUrls[0]);

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

    const transport = rpcUrl ? http(rpcUrl) : http(network.rpcUrls[0]);

    const walletClient = createWalletClient({
      account,
      chain: network.chain,
      transport
    });

    return walletClient;
  }

  public getClient(networkName: EvmNetworks, rpcUrl?: string): PublicClient {
    const network = this.getNetworkConfig(networkName);

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
   * Reads a contract with smart retry logic using exponential backoff and RPC switching.
   * Exhausts all available RPCs before repeating selections.
   *
   * @param networkName - The EVM network to read from
   * @param contractParams - The contract read parameters (abi, address, functionName, args)
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @param initialDelayMs - Initial delay in milliseconds before first retry (default: 1000)
   * @returns Contract read result
   */
  public async readContractWithRetry<T = unknown>(
    networkName: EvmNetworks,
    contractParams: {
      abi: any;
      address: `0x${string}`;
      functionName: string;
      args?: any[];
    },
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<T> {
    return this.executeWithRetry(
      networkName,
      async rpcUrl => {
        const publicClient = this.getClient(networkName, rpcUrl);
        return (await publicClient.readContract({
          ...contractParams,
          args: contractParams.args || []
        })) as T;
      },
      "read contract",
      maxRetries,
      initialDelayMs
    );
  }

  /**
   * Sends a transaction with smart retry logic using exponential backoff and RPC switching.
   * Exhausts all available RPCs before repeating selections.
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
    return this.executeWithRetry(
      networkName,
      async rpcUrl => {
        const walletClient = this.getWalletClient(networkName, account, rpcUrl);
        return await walletClient.sendTransaction(transactionParams);
      },
      "send transaction",
      maxRetries,
      initialDelayMs
    );
  }

  /**
   * Sends a raw transaction with smart retry logic using exponential backoff and RPC switching.
   * Exhausts all available RPCs before repeating selections.
   * This method should be used for idempotent operations where retrying is safe.
   *
   * @param networkName - The EVM network to send the transaction on
   * @param serializedTransaction - The serialized transaction data
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @param initialDelayMs - Initial delay in milliseconds before first retry (default: 1000)
   * @returns Transaction hash
   */
  public async sendRawTransactionWithRetry(
    networkName: EvmNetworks,
    serializedTransaction: `0x${string}`,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<string> {
    return this.executeWithRetry(
      networkName,
      async rpcUrl => {
        const publicClient = this.getClient(networkName, rpcUrl);
        return await publicClient.sendRawTransaction({
          serializedTransaction
        });
      },
      "send raw transaction",
      maxRetries,
      initialDelayMs
    );
  }
}
