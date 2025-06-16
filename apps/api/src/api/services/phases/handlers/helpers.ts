import { HORIZON_URL, StellarTokenDetails } from '@packages/shared';
import Big from 'big.js';
import { Horizon, Networks } from 'stellar-sdk';
import logger from '../../../../config/logger';
import { GLMR_FUNDING_AMOUNT_RAW, PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../../constants/constants';
import { API } from '../../pendulum/apiManager';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';

export const horizonServer = new Horizon.Server(HORIZON_URL);
export const NETWORK_PASSPHRASE = Networks.PUBLIC;

export async function isStellarEphemeralFunded(
  accountId: string,
  stellarTokenDetails: StellarTokenDetails,
): Promise<boolean> {
  try {
    // We check if the Stellar target account exists and has the respective trustline.
    const account = await horizonServer.loadAccount(accountId);

    const trustlineExists = account.balances.some(
      (balance) =>
        balance.asset_type === 'credit_alphanum4' &&
        balance.asset_code === stellarTokenDetails.stellarAsset.code.string &&
        balance.asset_issuer === stellarTokenDetails.stellarAsset.issuer.stellarEncoding,
    );
    return trustlineExists;
  } catch (error) {
    if (error?.toString().includes('NotFoundError')) {
      logger.info(`Stellar target account ${accountId} does not exist.`);
      return false;
    } else {
      // We return an error here to ensure that the phase fails and can be retried.
      throw new Error(`${error?.toString()} while checking Stellar target account.`);
    }
  }
}

export async function isPendulumEphemeralFunded(pendulumEphemeralAddress: string, pendulumNode: API): Promise<boolean> {
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();
  const { data: balance } = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);

  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

export async function isMoonbeamEphemeralFunded(moonbeamEphemeralAddress: string, moonebamNode: API): Promise<boolean> {
  const { data: balance } = await moonebamNode.api.query.system.account(moonbeamEphemeralAddress);
  return Big(balance.free.toString()).gte(GLMR_FUNDING_AMOUNT_RAW);
}
