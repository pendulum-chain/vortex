import { Account, Chain, createPublicClient, createWalletClient, http, PublicClient, Transport, WalletClient } from "viem";
import { arbitrum, avalanche, base, bsc, mainnet, moonbeam, polygon, polygonAmoy } from "viem/chains";
import { ALCHEMY_API_KEY, EvmNetworks, Networks } from "../../index";
import logger from "../../logger";
import { createSmartFallbackTransport } from "./smartFallbackTransport";

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

/**
 * Creates a transport for the given RPC URLs.
 * Uses smart fallback for multiple URLs, simple http for single URL.
 */
function createTransportForNetwork(rpcUrls: string[]): Transport {
  const validUrls = rpcUrls.filter(url => url !== "");

  if (validUrls.length === 0) {
    return http();
  }

  if (validUrls.length === 1) {
    return http(validUrls[0], { timeout: 10_000 });
  }

  return createSmartFallbackTransport(validUrls, {
    initialDelayMs: 1000,
    timeout: 10_000
  });
}

export class EvmClientManager {
  private static instance: EvmClientManager;
  private clientInstances: Map<EvmNetworks, PublicClient> = new Map();
  private walletClientInstances: Map<string, WalletClient<Transport, Chain, Account>> = new Map();
  private networks: EvmNetworkConfig[] = [];

  private constructor() {
    this.networks = getEvmNetworks(ALCHEMY_API_KEY);
    this.networks.forEach(network => {
      const client = this.createClient(network);
      this.clientInstances.set(network.name, client);
      logger.current.info(`Pre-created EVM client for ${network.name} with ${network.rpcUrls.length} RPC(s)`);
    });
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

  private createClient(network: EvmNetworkConfig): PublicClient {
    const transport = createTransportForNetwork(network.rpcUrls);

    return createPublicClient({
      chain: network.chain,
      transport
    });
  }

  private generateWalletClientKey(networkName: EvmNetworks, accountAddress: string): string {
    return `${networkName}-${accountAddress.toLowerCase()}`;
  }

  private createWalletClient(networkName: EvmNetworks, account: Account): WalletClient<Transport, Chain, Account> {
    const network = this.getNetworkConfig(networkName);
    const transport = createTransportForNetwork(network.rpcUrls);

    return createWalletClient({
      account,
      chain: network.chain,
      transport
    });
  }

  /**
   * Gets the public client for a network.
   * The client uses smart fallback transport with automatic retry and RPC switching.
   */
  public getClient(networkName: EvmNetworks): PublicClient {
    const client = this.clientInstances.get(networkName);

    if (!client) {
      throw new Error(`Client for ${networkName} not found. This should not happen.`);
    }

    return client;
  }

  /**
   * Gets or creates a wallet client for a network and account.
   * The client uses smart fallback transport with automatic retry and RPC switching.
   */
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

  /**
   * Reads a contract. Retry and fallback are handled automatically by the smart fallback transport.
   *
   * @param networkName - The EVM network to read from
   * @param contractParams - The contract read parameters (abi, address, functionName, args)
   * @returns Contract read result
   */
  public async readContract<T = unknown>(
    networkName: EvmNetworks,
    contractParams: {
      // biome-ignore lint/suspicious/noExplicitAny: ABI types are complex
      abi: any;
      address: `0x${string}`;
      functionName: string;
      // biome-ignore lint/suspicious/noExplicitAny: Contract args can be any type
      args?: any[];
    }
  ): Promise<T> {
    const publicClient = this.getClient(networkName);
    return (await publicClient.readContract({
      ...contractParams,
      args: contractParams.args || []
    })) as T;
  }

  /**
   * @deprecated Use readContract instead. Retry logic is now handled at transport level.
   */
  public async readContractWithRetry<T = unknown>(
    networkName: EvmNetworks,
    contractParams: {
      // biome-ignore lint/suspicious/noExplicitAny: ABI types are complex
      abi: any;
      address: `0x${string}`;
      functionName: string;
      // biome-ignore lint/suspicious/noExplicitAny: Contract args can be any type
      args?: any[];
    },
    _maxRetries = 3,
    _initialDelayMs = 1000
  ): Promise<T> {
    return this.readContract<T>(networkName, contractParams);
  }

  /**
   * Sends a transaction. Retry and fallback are handled automatically by the smart fallback transport.
   * This method should be used for idempotent operations where retrying is safe.
   *
   * @param networkName - The EVM network to send the transaction on
   * @param account - The account to send the transaction from
   * @param transactionParams - The transaction parameters
   * @returns Transaction hash
   */
  public async sendTransaction(
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
    }
  ): Promise<`0x${string}`> {
    const walletClient = this.getWalletClient(networkName, account);
    return await walletClient.sendTransaction(transactionParams);
  }

  /**
   * @deprecated Use sendTransaction instead. Retry logic is now handled at transport level.
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
    _maxRetries = 3,
    _initialDelayMs = 1000
  ): Promise<`0x${string}`> {
    return this.sendTransaction(networkName, account, transactionParams);
  }

  /**
   * Sends a raw transaction. Retry and fallback are handled automatically by the smart fallback transport.
   *
   * @param networkName - The EVM network to send the transaction on
   * @param serializedTransaction - The serialized transaction data
   * @returns Transaction hash
   */
  public async sendRawTransaction(networkName: EvmNetworks, serializedTransaction: `0x${string}`): Promise<string> {
    const publicClient = this.getClient(networkName);
    return await publicClient.sendRawTransaction({ serializedTransaction });
  }

  /**
   * @deprecated Use sendRawTransaction instead. Retry logic is now handled at transport level.
   */
  public async sendRawTransactionWithRetry(
    networkName: EvmNetworks,
    serializedTransaction: `0x${string}`,
    _maxRetries = 3,
    _initialDelayMs = 1000
  ): Promise<string> {
    return this.sendRawTransaction(networkName, serializedTransaction);
  }
}
