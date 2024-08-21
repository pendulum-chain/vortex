import { Horizon } from 'stellar-sdk';
import { HORIZON_URL } from '../../constants/constants';
import Big from 'big.js';

export const getStellarBalanceUnits = async (publicKey: string, assetCode: string): Promise<Big> => {
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
