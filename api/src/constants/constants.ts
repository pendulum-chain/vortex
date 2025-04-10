const HORIZON_URL = 'https://horizon.stellar.org';
const PENDULUM_FUNDING_AMOUNT_UNITS = '10'; // 10 PEN. Minimum balance of funding account
const PENDULUM_GLMR_FUNDING_AMOUNT_UNITS = '10'; // 10 GLMR. Minimum balance of funding account
const STELLAR_FUNDING_AMOUNT_UNITS = '10'; // 10 XLM.  Minimum balance of funding account
const MOONBEAM_FUNDING_AMOUNT_UNITS = '10'; // 10 GLMR. Minimum balance of funding account
const SUBSIDY_MINIMUM_RATIO_FUND_UNITS = '5'; // 5 Subsidies considering maximum subsidy amount use on each (worst case scenario)
const MOONBEAM_RECEIVER_CONTRACT_ADDRESS = '0x2AB52086e8edaB28193172209407FF9df1103CDc';
const STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS = '2.5'; // Amount to send to the new stellar ephemeral account created
const PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS = '0.1'; // Amount to send to the new pendulum ephemeral account created
const MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS = '3'; // Amount to send to the new moonbeam ephemeral account created
const BRLA_BASE_URL = 'https://api.brla.digital:5567/v1/business';
const DEFAULT_POLLING_INTERVAL = 3000;
const GLMR_FUNDING_AMOUNT_RAW = '50000000000000000';

const WEBHOOKS_CACHE_URL = 'https://webhooks-cache.pendulumchain.tech'; // EXAMPLE URL

const STELLAR_BASE_FEE = '1000000';

// Expiration and timeout values
const SEQUENCE_TIME_WINDOW_IN_SECONDS = 600; // 10 minutes. Marks the MAXIMUM window between creating the stellar ephemeral transactions and it's creation on chain.
const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;

const { PENDULUM_FUNDING_SEED } = process.env;
const { FUNDING_SECRET } = process.env;
const { MOONBEAM_EXECUTOR_PRIVATE_KEY } = process.env;
const SEP10_MASTER_SECRET = FUNDING_SECRET;
const { CLIENT_DOMAIN_SECRET } = process.env;
const { BRLA_LOGIN_PASSWORD } = process.env;
const { BRLA_LOGIN_USERNAME } = process.env;
const MOONBEAM_FUNDING_PRIVATE_KEY = MOONBEAM_EXECUTOR_PRIVATE_KEY;
const { BACKEND_TEST_STARTER_ACCOUNT } = process.env;

export {
  SEQUENCE_TIME_WINDOW_IN_SECONDS,
  BACKEND_TEST_STARTER_ACCOUNT,
  GLMR_FUNDING_AMOUNT_RAW,
  HORIZON_URL,
  PENDULUM_GLMR_FUNDING_AMOUNT_UNITS,
  PENDULUM_FUNDING_AMOUNT_UNITS,
  MOONBEAM_FUNDING_PRIVATE_KEY,
  PENDULUM_FUNDING_SEED,
  STELLAR_FUNDING_AMOUNT_UNITS,
  MOONBEAM_FUNDING_AMOUNT_UNITS,
  FUNDING_SECRET,
  MOONBEAM_EXECUTOR_PRIVATE_KEY,
  MOONBEAM_RECEIVER_CONTRACT_ADDRESS,
  SUBSIDY_MINIMUM_RATIO_FUND_UNITS,
  STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
  MOONBEAM_EPHEMERAL_STARTING_BALANCE_UNITS,
  SEP10_MASTER_SECRET,
  CLIENT_DOMAIN_SECRET,
  DEFAULT_LOGIN_EXPIRATION_TIME_HOURS,
  BRLA_BASE_URL,
  BRLA_LOGIN_PASSWORD,
  BRLA_LOGIN_USERNAME,
  WEBHOOKS_CACHE_URL,
  DEFAULT_POLLING_INTERVAL,
  STELLAR_BASE_FEE,
};
