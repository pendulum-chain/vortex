const { ApiPromise, WsProvider } = require('@polkadot/api');
const { NETWORK, PENDULUM_WSS } = require('../constants/constants');
require('dotenv').config();

class Mutex {
  constructor() {
    this.locks = new Map();
  }

  async lock(accountId) {
    let resolveLock;
    const lockPromise = new Promise((resolve) => {
      resolveLock = resolve;
    });

    const prevLock = this.locks.get(accountId) || Promise.resolve();
    this.locks.set(accountId, prevLock.then(() => lockPromise));

    await prevLock;
    return () => {
      resolveLock(undefined);
    };
  }
}

class ApiManager {
  constructor() {
    this.apiData = undefined;
  }

  async connectApi(socketUrl) {
    const wsProvider = new WsProvider(socketUrl);
    const api = await ApiPromise.create({
      provider: wsProvider,
      noInitWarn: true,
    });
    const mutex = new Mutex();

    const chainProperties = api.registry.getChainProperties();
    const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
    const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

    return { api, mutex, ss58Format, decimals };
  }

  async populateApi() {
    const network = { name: NETWORK, wss: PENDULUM_WSS };

    console.log(`Connecting to node ${network.wss}...`);
    this.apiData = await this.connectApi(network.wss);
    await this.apiData.api.isReady;
    console.log(`Connected to node ${network.wss}`);
  }

  async getApiComponents() {
    if (!this.apiData) {
      await this.populateApi();
    }
    return this.apiData;
  }
}

let instance;

async function getApiManagerInstance() {
  if (!instance) {
    const instancePreparing = new ApiManager();
    await instancePreparing.populateApi();
    instance = instancePreparing;
  }
  return instance;
}

module.exports = { getApiManagerInstance, ApiPromise };