const { Keyring } = require('@polkadot/api');
const Big = require('big.js');
const { getApiManagerInstance } = require('../../config/polkadotApi');
const { FUNDING_AMOUNT_UNITS } = require('../../constants/constants');
require('dotenv').config();

const pendulumFundingSeed = process.env.PENDULUM_FUNDING_SEED;
const TIMEOUT_MINUTES = 10;

function multiplyByPowerOfTen(bigDecimal, power) {
    const newBigDecimal = new Big(bigDecimal);
    if (newBigDecimal.c[0] === 0) return newBigDecimal;
  
    newBigDecimal.e += power;
    return newBigDecimal;
}

async function isEphemeralFunded(ephemeralAddress) {
  const pendulumApiComponents = await getApiManagerInstance();
  const apiData = pendulumApiComponents.apiData;

  const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, apiData.decimals).toFixed();

  const { data: balance } = await apiData.api.query.system.account(ephemeralAddress);
  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

exports.fundEphemeralAccount = async (ephemeralAddress) => {
  const isAlreadyFunded = await isEphemeralFunded();

  if (!isAlreadyFunded) {
    const pendulumApiComponents = await getApiManagerInstance();
    const apiData = pendulumApiComponents.apiData;

    const keyring = new Keyring({ type: 'sr25519', ss58Format: apiData.ss58Format });
    const fundingAccountKeypair = keyring.addFromUri(pendulumFundingSeed);

    const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
    const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, apiData.decimals).toFixed();

    await apiData.api.tx.balances
      .transfer(ephemeralAddress, fundingAmountRaw)
      .signAndSend(fundingAccountKeypair);

    const startTime = Date.now();
    const timeout = TIMEOUT_MINUTES * 60 * 1000;

    while (Date.now() - startTime < timeout) {
      if (await isEphemeralFunded(ephemeralAddress)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  return true;
}