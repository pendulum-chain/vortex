
import { Horizon } from 'stellar-sdk';
import Big from 'big.js';

import { HORIZON_URL } from '../../../constants/constants';


export function checkBalancePeriodically(
    stellarTargetAccountId: string,
    stellarAssetCode: string,
    amountDesiredUnitsBig: Big,
    intervalMs: number,
    timeoutMs: number,
  ) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const intervalId = setInterval(async () => {
        try {
          const someBalanceUnits = await getStellarBalanceUnits(
            stellarTargetAccountId,
            stellarAssetCode,
          );
          console.log(`Balance check: ${someBalanceUnits.toString()} / ${amountDesiredUnitsBig.toString()}`);
  
          if (someBalanceUnits.gte(amountDesiredUnitsBig)) {
            clearInterval(intervalId);
            resolve(someBalanceUnits);
          } else if (Date.now() - startTime > timeoutMs) {
            clearInterval(intervalId);
            reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
          }
        } catch (error) {
          console.error('Error checking balance:', error);
          // Don't clear the interval here, allow it to continue checking
        }
      }, intervalMs);
  
      // Set a timeout to reject the promise if the total time exceeds timeoutMs
      setTimeout(() => {
        clearInterval(intervalId);
        reject(new Error(`Balance did not meet the limit within the specified time (${timeoutMs} ms)`));
      }, timeoutMs);
    });
  }


const getStellarBalanceUnits = async (publicKey: string, assetCode: string): Promise<Big> => {
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(publicKey);
    let balanceUnits = '0';
    account.balances.forEach((balance) => {
      if (balance.asset_type === 'credit_alphanum4' && balance.asset_code === assetCode) {
        balanceUnits = balance.balance;
      }
    });

    return new Big(balanceUnits);
  } catch (error) {
    console.log(error);
    throw new Error('Error Reading Stellar Balance');
  }
};