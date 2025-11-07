import { ApiPromise, WsProvider } from "@polkadot/api";
import { SubmittableExtrinsic } from "@polkadot/api/submittable/types";
import { KeyringPair } from "@polkadot/keyring/types";
import { ISubmittableResult } from "@polkadot/types/types";
import logger from "../../logger";

export type SubstrateApiNetwork = "assethub" | "pendulum" | "moonbeam" | "hydration" | "paseo";

export interface NetworkConfig {
  name: SubstrateApiNetwork;
  wsUrls: string[];
}

const NETWORKS: NetworkConfig[] = [
  {
    name: "assethub",
    wsUrls: ["wss://dot-rpc.stakeworld.io/assethub"]
  },
  {
    name: "hydration",
    wsUrls: ["wss://rpc.hydradx.cloud"]
  },
  {
    name: "moonbeam",
    wsUrls: ["wss://wss.api.moonbeam.network", "wss://moonbeam.api.onfinality.io/public-ws", "wss://moonbeam.ibp.network"]
  },
  {
    name: "pendulum",
    wsUrls: ["wss://rpc-pendulum.prd.pendulumchain.tech"]
  },
  {
    name: "paseo",
    wsUrls: ["wss://asset-hub-paseo-rpc.n.dwellir.com"]
  }
];

export type API = {
  api: ApiPromise;
  ss58Format: number;
  decimals: number;
};

export class ApiManager {
  private static instance: ApiManager;

  // Primary, default API instance
  private apiInstances: Map<string, API> = new Map();

  // All API instances keyed by "networkName-rpcIndex".
  private allApiInstances: Map<string, API> = new Map();

  private previousSpecVersions: Map<string, number> = new Map();

  private currentTransactionNonce: Map<string, Map<string, number>> = new Map();

  private nonceQueues: Map<string, Promise<unknown>> = new Map();

  private networks: NetworkConfig[] = [];

  private constructor() {
    this.networks = NETWORKS;

    // Initialize nonce maps for each network
    this.networks.forEach(network => {
      this.currentTransactionNonce.set(network.name, new Map());
      this.nonceQueues.set(network.name, Promise.resolve());
    });
  }

  public static getInstance(): ApiManager {
    if (!ApiManager.instance) {
      ApiManager.instance = new ApiManager();
    }
    return ApiManager.instance;
  }

  public async populateApi(networkName: SubstrateApiNetwork, wsUrlIndex?: number): Promise<API> {
    const network = this.getNetworkConfig(networkName);
    const wsUrl = wsUrlIndex !== undefined ? network.wsUrls[wsUrlIndex] : network.wsUrls[0];
    logger.current.info(`Connecting to node ${wsUrl}...`);
    const newApi = await this.connectApi(networkName, wsUrlIndex);
    this.apiInstances.set(networkName, newApi);
    logger.current.info(`Connected to node ${wsUrl}`);

    if (!newApi.api.isConnected) await newApi.api.connect();
    await newApi.api.isReady;

    return newApi;
  }

  public async populateAllApis(): Promise<Map<string, API>> {
    for (const network of this.networks) {
      await this.populateApi(network.name);
    }
    return this.apiInstances;
  }

  public async getApi(networkName: SubstrateApiNetwork, forceRefresh = false): Promise<API> {
    const apiInstance = this.apiInstances.get(networkName);

    if (!apiInstance || forceRefresh) {
      return await this.populateApi(networkName);
    }

    const currentSpecVersion = await this.getSpecVersion(apiInstance.api);
    const previousSpecVersion = this.previousSpecVersions.get(networkName) ?? 0;

    if (currentSpecVersion !== previousSpecVersion) {
      logger.current.info(`Spec version changed for ${networkName}, refreshing the api...`);
      return await this.populateApi(networkName);
    }

    return apiInstance;
  }

  /**
   * Gets an API instance with a randomly selected RPC URL from the available RPCs.
   *
   * @param networkName - The network to connect to
   * @returns A cached API instance connected to a randomly selected RPC
   */
  public async getApiWithShuffling(networkName: SubstrateApiNetwork): Promise<API> {
    const network = this.getNetworkConfig(networkName);
    const randomIndex = Math.floor(Math.random() * network.wsUrls.length);
    const instanceKey = this.generateInstanceKey(networkName, randomIndex);

    let apiInstance = this.allApiInstances.get(instanceKey);

    if (apiInstance) {
      logger.current.info(`Using cached API connection to ${networkName} (RPC index: ${randomIndex})`);
      return apiInstance;
    }

    logger.current.info(`Creating new API connection to ${networkName} (RPC index: ${randomIndex})`);
    apiInstance = await this.connectApi(networkName, randomIndex);
    this.allApiInstances.set(instanceKey, apiInstance);

    return apiInstance;
  }

  private generateInstanceKey(networkName: SubstrateApiNetwork, rpcIndex: number): string {
    return `${networkName}-${rpcIndex}`;
  }

  public async executeApiCall(
    createCall: (api: ApiPromise) => SubmittableExtrinsic<"promise", ISubmittableResult>,
    senderKeypair: KeyringPair,
    networkName: SubstrateApiNetwork
  ): Promise<{ hash: string }> {
    const apiInstance = await this.getApi(networkName);
    const call = createCall(apiInstance.api);

    try {
      const nonce = await this.getNonce(senderKeypair, networkName);
      logger.current.info(`Sending transaction on ${networkName} with nonce ${nonce}`);

      return new Promise((resolve, reject) => {
        call.signAndSend(senderKeypair, { nonce }, (submissionResult: ISubmittableResult) => {
          const { status, dispatchError } = submissionResult;

          if (dispatchError) {
            reject(new Error(`Transaction failed: ${dispatchError}`));
          }

          if (submissionResult.isError) {
            reject(new Error(`Transaction was not included: ${submissionResult.dispatchError}`));
          }

          if (submissionResult.isFinalized) {
            const hash = status.asFinalized.toString();
            resolve({ hash });
          }
        });
      });
    } catch (initialE: unknown) {
      const initialError = initialE instanceof Error ? initialE : new Error(String(initialE));
      // Only retry if the error is regarding bad signature error
      if (initialError.name === "RpcError" && initialError.message.includes("Transaction has a bad signature")) {
        logger.current.info(
          `Bad signature error encountered while sending transaction on ${networkName}, attempting to refresh the api...`
        );

        try {
          await this.populateApi(networkName);
          const nonce = await this.getNonce(senderKeypair, networkName);
          return new Promise((resolve, reject) => {
            call.signAndSend(senderKeypair, { nonce }, (submissionResult: ISubmittableResult) => {
              const { status, dispatchError } = submissionResult;

              if (dispatchError) {
                reject(new Error(`Transaction failed: ${dispatchError}`));
              }

              if (submissionResult.isError) {
                reject(new Error(`Transaction was not included: ${submissionResult.dispatchError}`));
              }

              if (submissionResult.isFinalized) {
                const hash = status.asFinalized.toString();
                resolve({ hash });
              }
            });
          });
        } catch (retryError) {
          throw retryError;
        }
      } else {
        throw initialError;
      }
    }
  }

  private async getSpecVersion(apiInstance: ApiPromise): Promise<number> {
    const runtimeVersion = await apiInstance.call.core.version();
    const human = runtimeVersion.toHuman() as { specVersion: number };
    return human.specVersion;
  }

  private getNetworkConfig(networkName: SubstrateApiNetwork): NetworkConfig {
    const network = this.networks.find(n => n.name === networkName);
    if (!network) {
      throw new Error(`Network ${networkName} not configured`);
    }
    return network;
  }

  private async connectApi(networkName: SubstrateApiNetwork, wsUrlIndex?: number): Promise<API> {
    const network = this.getNetworkConfig(networkName);
    const wsUrl = wsUrlIndex !== undefined ? network.wsUrls[wsUrlIndex] : network.wsUrls[0];

    // Parameters from here https://github.com/galacticcouncil/sdk/blob/master/packages/sdk/TROUBLESHOOTING.md#websocket-ttl-cache
    const wsProvider = new WsProvider(wsUrl, 2_500, {}, 60_000, 102400, 10 * 60_000);
    const api = await ApiPromise.create({
      noInitWarn: true,
      provider: wsProvider
    });

    const chainProperties = api.registry.getChainProperties();
    const ss58Format = Number(chainProperties?.get("ss58Format")?.toString() ?? 42);
    const decimals = Number(chainProperties?.get("tokenDecimals")?.toHuman()[0]) ?? 12;

    this.previousSpecVersions.set(networkName, await this.getSpecVersion(api));

    return { api, decimals, ss58Format };
  }

  private async getNonce(senderKeypair: KeyringPair, networkName: SubstrateApiNetwork): Promise<number> {
    let nonceQueue = this.nonceQueues.get(networkName);
    if (!nonceQueue) {
      nonceQueue = Promise.resolve();
      this.nonceQueues.set(networkName, nonceQueue);
    }

    // Create a new promise that continues from the current queue
    const newNoncePromise = nonceQueue
      .catch(err => {
        logger.current.error(`Previous nonce retrieval error for ${networkName}:`, err);
      })
      .then(async () => {
        const apiInstance = await this.getApi(networkName);
        const nonceMap = this.currentTransactionNonce.get(networkName);

        if (!nonceMap) {
          throw new Error(`Nonce map not initialized for network ${networkName}`);
        }

        const nonceRpc = (await apiInstance.api.rpc.system.accountNextIndex(senderKeypair.publicKey)).toNumber();
        const lastUsedNonce = nonceMap.get(senderKeypair.address) ?? 0;

        if (nonceRpc > lastUsedNonce || nonceRpc === 0) {
          nonceMap.set(senderKeypair.address, nonceRpc);
          return nonceRpc;
        }

        logger.current.info(
          `Nonce mismatch detected on ${networkName}. RPC: ${nonceRpc}, ApiManager: ${lastUsedNonce}, sending transaction with nonce ${
            lastUsedNonce + 1
          }`
        );
        nonceMap.set(senderKeypair.address, lastUsedNonce + 1);
        return lastUsedNonce + 1;
      });

    // Update the queue in the map
    this.nonceQueues.set(networkName, newNoncePromise);

    // Wait for and return the nonce
    return await newNoncePromise;
  }
}
