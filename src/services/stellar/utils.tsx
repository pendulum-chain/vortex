import { Horizon, Keypair } from 'stellar-sdk';
import { HORIZON_URL } from '../../constants/constants';

export const checkStellarAccount = async (secret: string): Promise<boolean> => {

  try {
    const server = new Horizon.Server(HORIZON_URL);
    const keypair = Keypair.fromSecret(secret);
    
    //loading the account should be enough check if the account exists
    const account = await server.loadAccount(keypair.publicKey());
    return true; 
  } catch (error) {
    console.error("Stellar Account Error:", error);
    return false;
  }
};