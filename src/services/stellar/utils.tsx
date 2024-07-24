import { Horizon, Keypair } from 'stellar-sdk';
import { HORIZON_URL } from '../../constants/constants';
import Big from 'big.js';

export const checkStellarBalance = async (publicKey: string, assetCode: string): Promise<Big> => {
  try {
    const server = new Horizon.Server(HORIZON_URL);
    const account = await server.loadAccount(publicKey);
    let balanceRaw = '0';
    account.balances.forEach((balance) => {
      if (balance.asset_type === 'credit_alphanum4' && balance.asset_code === assetCode) {
        balanceRaw = balance.balance;
      }
    });

    return new Big(balanceRaw);
  } catch (error) {
    console.log(error);
    throw new Error('Error Reading Stellar Balance');
  }
};
