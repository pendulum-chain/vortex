import { FiatToken, HORIZON_URL, RampPhase, StellarTokenDetails, getNetworkFromDestination } from '@packages/shared';
import Big from 'big.js';
import { Horizon, NetworkError, Networks, Transaction } from 'stellar-sdk';
import logger from '../../../../config/logger';
import { GLMR_FUNDING_AMOUNT_RAW, PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS } from '../../../../constants/constants';
import RampState from '../../../../models/rampState.model';
import { fundMoonbeamEphemeralAccount } from '../../moonbeam/balance';
import { API, ApiManager } from '../../pendulum/apiManager';
import { multiplyByPowerOfTen } from '../../pendulum/helpers';
import { fundEphemeralAccount } from '../../pendulum/pendulum.service';
import { BasePhaseHandler } from '../base-phase-handler';
import { StateMetadata } from '../meta-state-types';

const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

export class FundEphemeralPhaseHandler extends BasePhaseHandler {
  public getPhaseName(): RampPhase {
    return 'fundEphemeral';
  }

  protected async executePhase(state: RampState): Promise<RampState> {
    const apiManager = ApiManager.getInstance();
    const pendulumNode = await apiManager.getApi('pendulum');
    const moonebamNode = await apiManager.getApi('moonbeam');

    const { moonbeamEphemeralAddress, pendulumEphemeralAddress } = state.state as StateMetadata;

    if (!pendulumEphemeralAddress) {
      throw new Error('FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.');
    }
    if (state.type === 'on' && !moonbeamEphemeralAddress) {
      throw new Error('FundEphemeralPhaseHandler: State metadata corrupted. This is a bug.');
    }

    try {
      const isPendulumFunded = await isPendulumEphemeralFunded(pendulumEphemeralAddress, pendulumNode);

      let isMoonbeamFunded = true;
      if (state.type === 'on' && moonbeamEphemeralAddress) {
        isMoonbeamFunded = await isMoonbeamEphemeralFunded(moonbeamEphemeralAddress, moonebamNode);
      }

      if (state.state.stellarTarget) {
        const isFunded = await isStellarEphemeralFunded(state.state.stellarTarget);
        if (!isFunded) {
          await this.fundStellarEphemeralAccount(state);
        }
      }

      if (!isPendulumFunded) {
        logger.info('Funding pen ephemeral...');
        if (state.type === 'on' && state.to !== 'assethub') {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, true);
        } else if (state.state.outputCurrency === FiatToken.BRL) {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, true);
        } else {
          await fundEphemeralAccount('pendulum', pendulumEphemeralAddress, false);
        }
      } else {
        logger.info('Pendulum ephemeral address already funded.');
      }

      if (state.type === 'on' && !isMoonbeamFunded) {
        logger.info('Funding moonbeam ephemeral...');

        const destinationNetwork = getNetworkFromDestination(state.to);
        // For onramp case, "to" is always a network.
        if (!destinationNetwork) {
          throw new Error('FundEphemeralPhaseHandler: Invalid destination network.');
        }

        await fundMoonbeamEphemeralAccount(moonbeamEphemeralAddress);
      }
    } catch (e) {
      console.error('Error in FundEphemeralPhaseHandler:', e);
      const recoverableError = this.createRecoverableError('Error funding ephemeral account');
      throw recoverableError;
    }

    return this.transitionToNextPhase(state, this.nextPhaseSelector(state));
  }

  protected nextPhaseSelector(state: RampState): RampPhase {
    // onramp case
    if (state.type === 'on') {
      return 'moonbeamToPendulumXcm';
    }

    // off ramp cases
    if (state.type === 'off' && state.from === 'assethub') {
      return 'distributeFees';
    } else {
      return 'moonbeamToPendulum'; // Via contract.subsidizePreSwap
    }
  }

  protected async fundStellarEphemeralAccount(state: RampState): Promise<void> {
    const { txData: stellarCreationTransactionXDR } = this.getPresignedTransaction(state, 'stellarCreateAccount');
    if (typeof stellarCreationTransactionXDR !== 'string') {
      throw new Error(
        'FundEphemeralHandler: `stellarCreateAccount` transaction is not a string -> not an encoded Stellar transaction.',
      );
    }

    try {
      const stellarCreationTransaction = new Transaction(stellarCreationTransactionXDR, NETWORK_PASSPHRASE);
      await horizonServer.submitTransaction(stellarCreationTransaction);
    } catch (e) {
      const horizonError = e as NetworkError;
      if (horizonError.response.data?.status === 400) {
        logger.info(
          `Could not submit the stellar account creation transaction ${JSON.stringify(
            horizonError.response.data.extras.result_codes,
          )}`,
        );

        // TODO this error may need adjustment, as the `tx_bad_seq` may be due to parallel ramps and ephemeral creations.
        if (horizonError.response.data.extras.result_codes.transaction === 'tx_bad_seq') {
          logger.info('Recovery mode: Creation already performed.');
        }
        logger.error(`Could not submit the stellar creation transaction: ${horizonError.response.data.extras}`);
        throw new Error('Could not submit the stellar creation transaction');
      } else {
        logger.error(`Could not submit the stellar creation transaction: ${horizonError.response.data}`);
        throw new Error('Could not submit the stellar creation transaction');
      }
    }
  }
}

async function isStellarEphemeralFunded(stellarTarget: {
  stellarTargetAccountId: string;
  stellarTokenDetails: StellarTokenDetails;
}): Promise<boolean> {
  try {
    // We check if the Stellar target account exists and has the respective trustline.
    const account = await horizonServer.loadAccount(stellarTarget.stellarTargetAccountId);

    const trustlineExists = account.balances.some(
      (balance) =>
        balance.asset_type === 'credit_alphanum4' &&
        balance.asset_code === stellarTarget.stellarTokenDetails.stellarAsset.code.string &&
        balance.asset_issuer === stellarTarget.stellarTokenDetails.stellarAsset.issuer.stellarEncoding,
    );
    return trustlineExists;
  } catch (error) {
    if (error?.toString().includes('NotFoundError')) {
      logger.info(
        `SpacewalkRedeemPhaseHandler: Stellar target account ${stellarTarget.stellarTargetAccountId} does not exist.`,
      );
    } else {
      // We return an error here to ensure that the phase fails and can be retried.
      throw new Error(`SpacewalkRedeemPhaseHandler: ${error?.toString()} while checking Stellar target account.`);
    }

    return false;
  }
}

async function isPendulumEphemeralFunded(pendulumEphemeralAddress: string, pendulumNode: API): Promise<boolean> {
  const fundingAmountUnits = Big(PENDULUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  const fundingAmountRaw = multiplyByPowerOfTen(fundingAmountUnits, pendulumNode.decimals).toFixed();
  const { data: balance } = await pendulumNode.api.query.system.account(pendulumEphemeralAddress);

  return Big(balance.free.toString()).gte(fundingAmountRaw);
}

async function isMoonbeamEphemeralFunded(moonbeamEphemeralAddress: string, moonebamNode: API): Promise<boolean> {
  const { data: balance } = await moonebamNode.api.query.system.account(moonbeamEphemeralAddress);
  return Big(balance.free.toString()).gte(GLMR_FUNDING_AMOUNT_RAW);
}

export default new FundEphemeralPhaseHandler();
