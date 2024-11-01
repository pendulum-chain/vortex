const { Keyring } = require('@polkadot/api');
const { ApiPromise, WsProvider } = require('@polkadot/api');
const Big = require('big.js');
const {
  PENDULUM_FUNDING_AMOUNT_UNITS,
  PENDULUM_WSS,
  SUBSIDY_MINIMUM_RATIO_FUND_UNITS,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
} = require('../../constants/constants');
const { TOKEN_CONFIG } = require('../../constants/tokenConfig');

require('dotenv').config();

const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;

function multiplyByPowerOfTen(bigDecimal, power) {
  const newBigDecimal = new Big(bigDecimal);
  if (newBigDecimal.c[0] === 0) return newBigDecimal;

  newBigDecimal.e += power;
  return newBigDecimal;
}

let api;
let previousSpecVersion;

async function createPolkadotApi() {
  const getSpecVersion = async () => {
    const runtimeVersion = await api.call.core.version();
    return runtimeVersion.toHuman().specVersion;
  };

  const initiateApi = async () => {
    const wsProvider = new WsProvider(PENDULUM_WSS);
    api = await ApiPromise.create({
      provider: wsProvider,
    });
    await api.isReady;

    previousSpecVersion = await getSpecVersion();
  };

  if (!api) {
    await initiateApi();
  }

  if (!api.isConnected) await api.connect();
  await api.isReady;

  const currentSpecVersion = await getSpecVersion();
  if (currentSpecVersion !== previousSpecVersion) {
    await initiateApi();
  }

  const chainProperties = api.registry.getChainProperties();
  const ss58Format = Number(chainProperties?.get('ss58Format')?.toString() ?? 42);
  const decimals = Number(chainProperties?.get('tokenDecimals')?.toHuman()[0]) ?? 12;

  return { api, decimals, ss58Format };
}

function getFundingData(ss58Format, decimals) {
  const keyring = new Keyring({ type: 'sr25519', ss58Format });
  const fundingAccountKeypair = keyring.addFromUri(PENDULUM_FUNDING_SEED);
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
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
  const { fundingAccountKeypair } = getFundingData(apiData.ss58Format, apiData.decimals);
  const { data: balance } = await apiData.api.query.system.account(fundingAccountKeypair.address);

  let isTokensSufficient = true;

  // Wait for all required token balances check.
  await Promise.all(
    Object.entries(TOKEN_CONFIG).map(async ([token, tokenConfig]) => {
      console.log(`Checking token ${token} balance...`);
      const tokenBalanceResponse = await apiData.api.query.tokens.accounts(
        fundingAccountKeypair.address,
        tokenConfig.pendulumCurrencyId,
      );

      const tokenBalance = Big(tokenBalanceResponse?.free?.toString() ?? '0');
      const maximumSubsidyAmountRaw = Big(tokenConfig.maximumSubsidyAmountRaw);
      const remainingMaxSubsidiesAvailable = tokenBalance.div(maximumSubsidyAmountRaw);

      if (remainingMaxSubsidiesAvailable.lt(SUBSIDY_MINIMUM_RATIO_FUND_UNITS)) {
        isTokensSufficient = false;
        console.log(`Token ${token} balance is insufficient.`);
      }
    }),
  );

  const minimumBalanceFundingAccount = multiplyByPowerOfTen(Big(PENDULUM_FUNDING_AMOUNT_UNITS), apiData.decimals);
  const nativeBalance = Big(balance?.free?.toString() ?? '0');
  if (nativeBalance.gte(minimumBalanceFundingAccount) && isTokensSufficient) {
    return { status: true, public: fundingAccountKeypair.address };
  }
  return { status: false, public: fundingAccountKeypair.address };
};
