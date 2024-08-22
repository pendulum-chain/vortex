const { Keyring } = require('@polkadot/api');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const Big = require('big.js');
const { FUNDING_AMOUNT_UNITS, PENDULUM_WSS, PENDULUM_FUNDING_SEED } = require('../../constants/constants');
require('dotenv').config();

const pendulumFundingSeed = PENDULUM_FUNDING_SEED;

function multiplyByPowerOfTen(bigDecimal, power) {
  const newBigDecimal = new Big(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e += power;
  return newBigDecimal;
}

async function createPolkadotApi() {
  const wsProvider = new WsProvider(PENDULUM_WSS);
  const api = await ApiPromise.create({
    provider: wsProvider,
  });
  await api.isReady;

  const chainProperties = api.registry.getChainProperties();
  const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
  const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

  return { api, decimals, ss58Format };
}

function getFundingData(ss58Format, decimals) {
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const fundingAccountKeypair = keyring.addFromUri(pendulumFundingSeed);
  const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, decimals).toFixed();

  return { fundingAccountKeypair, fundingAmountRaw };
}

exports.fundEphemeralAccount = async (ephemeralAddress) => {
  try {
    const apiData = await createPolkadotApi();
    const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);

    await apiData.api.tx.balances.transfer(ephemeralAddress, fundingAmountRaw).signAndSend(fundingAccountKeypair);

    return true;
  } catch (error) {
    console.error('Error during funding:', error);
    return false;
  }
};

exports.sendStatusWithPk = async () => {
  const apiData = await createPolkadotApi();
  const { fundingAccountKeypair, fundingAmountRaw } = getFundingData(apiData.ss58Format, apiData.decimals);
  const { data: balance } = await apiData.api.query.system.account(fundingAccountKeypair.address);

  if (Big(balance.free.toString()).gte(fundingAmountRaw)) {
    return { status: true, public: fundingAccountKeypair.address };
  }
  return { status: false, public: fundingAccountKeypair.address };
};
