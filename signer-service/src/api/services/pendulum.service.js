const { Keyring } = require('@polkadot/api');
const { ApiPromise, WsProvider } = require("@polkadot/api");
const Big = require('big.js');
const { FUNDING_AMOUNT_UNITS, PENDULUM_WSS } = require('../../constants/constants');
require('dotenv').config();

const pendulumFundingSeed = process.env.PENDULUM_FUNDING_SEED;

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

function getFundingData() {
    const keyring = new Keyring({ type: 'sr25519', ss58Format: ss58Format });
    const fundingAccountKeypair = keyring.addFromUri(pendulumFundingSeed);
    const fundingAmountUnits = Big(FUNDING_AMOUNT_UNITS);
    const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, apiData.decimals).toFixed();

    return { fundingAccountKeypair, fundingAmountRaw };
}

exports.fundEphemeralAccount = async (ephemeralAddress) => {
    const apiData = await createPolkadotApi();
    const fundingData = getFundingData();

    await apiData.api.tx.balances
        .transfer(ephemeralAddress, fundingData.fundingAmountRaw)
        .signAndSend(fundingData.fundingAccountKeypair);
}

exports.sendStatusWithPk = async (req, res, next) => {
    const apiData = await createPolkadotApi();
    const fundingData = getFundingData();
    const { data: balance } = await apiData.api.query.system.account(fundingData.fundingAccountKeypair.address);

    if (Big(balance.free.toString()).gte(fundingData.fundingAmountRaw)) {
        return { status: true, public: fundingData.fundingAccountKeypair.address };
    }
    return { status: false, public: fundingData.fundingAccountKeypair.address };
}