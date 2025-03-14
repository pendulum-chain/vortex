import { ApiPromise, WsProvider } from '@polkadot/api';
import { PENDULUM_WSS } from '../../../constants/constants';
import { ApiOptions, SubmittableExtrinsic } from '@polkadot/api/types';
import { rpc } from '@pendulum-chain/types';
import { ISubmittableResult } from '@polkadot/types/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { Index } from '@polkadot/types/interfaces';

export type API = {
  api: ApiPromise;
  ss58Format: number;
  decimals: number;
};

export class ApiManager {
  private apiInstance: API | undefined = undefined;
  private previousSpecVersion: number = 0;
  private currentTransactionNonce: Map<string, number> = new Map();
  private nonceQueue: Promise<any> = Promise.resolve();

  constructor() {}

  private async getSpecVersion(apiInstance: ApiPromise): Promise<number> {
    const runtimeVersion = await apiInstance.call.core.version();
    const human = runtimeVersion.toHuman() as { specVersion: number };
    return human.specVersion;
  }

  private async connectApi(): Promise<API> {
    const wsProvider = new WsProvider(PENDULUM_WSS);
    const api = await ApiPromise.create({
      provider: wsProvider,
      noInitWarn: true,
    });

    const chainProperties = api.registry.getChainProperties();
    const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
    const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

    this.previousSpecVersion = await this.getSpecVersion(api);

    return { api, ss58Format, decimals };
  }

  public async populateApi(): Promise<API> {
    console.log(`Connecting to node ${PENDULUM_WSS}...`);
    const newApi = await this.connectApi();
    this.apiInstance = newApi;
    console.log(`Connected to node ${PENDULUM_WSS}`);

    if (!this.apiInstance.api.isConnected) await this.apiInstance.api.connect();
    await this.apiInstance.api.isReady;

    return newApi;
  }

  public async getApi(forceRefresh = false): Promise<API> {
    if (!this.apiInstance || forceRefresh) {
      this.apiInstance = await this.populateApi();
    }

    const currentSpecVersion = await this.getSpecVersion(this.apiInstance.api);

    if (currentSpecVersion !== this.previousSpecVersion) {
      console.log(`Spec version changed, refreshing the api...`);
      await this.populateApi();
    }

    return this.apiInstance;
  }

  private async getNonce(senderKeypair: KeyringPair): Promise<number> {
    const nonce = await (this.nonceQueue = this.nonceQueue
      .catch((err) => {
        console.error('Previous nonce retrieval error:', err);
      })
      .then(async () => {
        const apiInstance = await this.getApi();

        const nonceRpc = (await apiInstance.api.rpc.system.accountNextIndex(senderKeypair.publicKey)).toNumber();
        const lastUsedNonce = this.currentTransactionNonce.get(senderKeypair.address) ?? 0;

        if (nonceRpc > lastUsedNonce) {
          this.currentTransactionNonce.set(senderKeypair.address, nonceRpc);
          return nonceRpc;
        }

        console.log(
          `Nonce mismatch detected. RPC: ${nonceRpc}, ApiManager: ${lastUsedNonce}, sending transaction with nonce ${
            lastUsedNonce + 1
          }`,
        );
        this.currentTransactionNonce.set(senderKeypair.address, lastUsedNonce + 1);
        return lastUsedNonce + 1;
      }));
    return nonce;
  }

  public async executeApiCall(
    createCall: (api: ApiPromise) => SubmittableExtrinsic<'promise', ISubmittableResult>,
    senderKeypair: KeyringPair,
  ): Promise<any> {
    let apiInstance = await this.getApi();
    const call = createCall(apiInstance.api);

    try {
      const nonce = await this.getNonce(senderKeypair);
      console.log(`Sending transaction with nonce ${nonce}`);
      return call.signAndSend(senderKeypair, { nonce });
    } catch (initialError: any) {
      // Only retry if the error is regarding bad signature error
      if (initialError.name === 'RpcError' && initialError.message.includes('Transaction has a bad signature')) {
        console.log(`Bad signature error encountered while sending transaction, attempting to refresh the api...`);

        try {
          await this.populateApi();
          const nonce = await this.getNonce(senderKeypair);
          return call.signAndSend(senderKeypair, { nonce });
        } catch (retryError) {
          throw retryError;
        }
      } else {
        throw initialError;
      }
    }
  }
}
