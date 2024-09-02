const HORIZON_URL = 'https://horizon.stellar.org';
const BASE_FEE = '1000000';
const PENDULUM_WSS = 'wss://rpc-pendulum.prd.pendulumchain.tech';
const NETWORK = 'Pendulum';
const FUNDING_AMOUNT_UNITS = '0.1';
require('dotenv').config();

const PENDULUM_FUNDING_SEED = process.env.PENDULUM_FUNDING_SEED;
const FUNDING_SECRET = process.env.FUNDING_SECRET;

module.exports = { BASE_FEE, HORIZON_URL, PENDULUM_WSS, NETWORK, FUNDING_AMOUNT_UNITS, PENDULUM_FUNDING_SEED, FUNDING_SECRET };
