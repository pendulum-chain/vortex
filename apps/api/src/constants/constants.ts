// Static constants only — all secrets and env vars live in config/vars.ts

const PENDULUM_FUNDING_AMOUNT_UNITS = "10"; // 10 PEN. Minimum balance of funding account
const PENDULUM_GLMR_FUNDING_AMOUNT_UNITS = "10"; // 10 GLMR. Minimum balance of funding account
const SUBSIDY_MINIMUM_RATIO_FUND_UNITS = "5"; // 5 Subsidies considering maximum subsidy amount use on each (worst case scenario)
const PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS = "0.1"; // Amount to send to the new pendulum ephemeral account created
const MOONBEAM_EVM_SOURCE_STARTING_BALANCE_UNITS = "0.34"; // GLMR reserve for source-chain EVM transactions
const POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS = "1.5"; // Amount to send to the new polygon ephemeral account created
const BASE_EPHEMERAL_STARTING_BALANCE_UNITS = "0.00015"; // Amount to send to the new base ephemeral account created

const GLMR_FUNDING_AMOUNT_RAW = "50000000000000000";
const MAX_FINAL_SETTLEMENT_SUBSIDY_USD = "10"; // 10 USD

const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;
const RAMP_START_EXPIRATION_TIME_SECONDS = 15 * 60;

export {
  BASE_EPHEMERAL_STARTING_BALANCE_UNITS,
  DEFAULT_LOGIN_EXPIRATION_TIME_HOURS,
  GLMR_FUNDING_AMOUNT_RAW,
  MAX_FINAL_SETTLEMENT_SUBSIDY_USD,
  MOONBEAM_EVM_SOURCE_STARTING_BALANCE_UNITS,
  PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS,
  PENDULUM_FUNDING_AMOUNT_UNITS,
  PENDULUM_GLMR_FUNDING_AMOUNT_UNITS,
  POLYGON_EPHEMERAL_STARTING_BALANCE_UNITS,
  RAMP_START_EXPIRATION_TIME_SECONDS,
  SUBSIDY_MINIMUM_RATIO_FUND_UNITS
};
