import { Horizon, Keypair, TransactionBuilder, Operation, Networks, Asset, Memo, Transaction } from 'stellar-sdk';
import {HORIZON_URL, BASE_FEE, ASSET_CODE, ASSET_ISSUER} from '../../constants/constants';
import { ISep24Result } from '../anchor';



const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = Networks.PUBLIC;

export interface IStellarOperations{
    offrampingTransaction: Transaction;
    mergeAccountTransaction: Transaction;

}
  
//getter for account and operations
export async function setUpAccountAndOperations(sep24Result:ISep24Result, ephemeralKeys: Keypair, stellarFundingSecret: string): Promise<IStellarOperations> {

    await setupStellarAccount(stellarFundingSecret, ephemeralKeys);
    const offrampingTransaction = await createOfframpTransaction(sep24Result, ephemeralKeys);
     const mergeAccountTransaction = await createAccountMergeTransaction(
         stellarFundingSecret,
         ephemeralKeys
     );

    return {offrampingTransaction, mergeAccountTransaction};
}


async function setupStellarAccount(fundingSecret: string, ephemeralKeys: Keypair) {
    console.log("Setup Stellar ephemeral account");
  
    const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
    const fundingAccountId = fundingAccountKeypair.publicKey();
    const fundingAccount = await horizonServer.loadAccount(fundingAccountId);
    const ephemeralAccountId = ephemeralKeys.publicKey();
  
    // add a setOption oeration in order to make this a 2-of-2 multisig account where the
    // funding account is a cosigner
    const createAccountTransaction = new TransactionBuilder(fundingAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.createAccount({
          destination: ephemeralAccountId,
          startingBalance: "2.5",
        })
      )
      .addOperation(
        Operation.setOptions({
          source: ephemeralAccountId,
          signer: { ed25519PublicKey: fundingAccountId, weight: 1 },
          lowThreshold: 2,
          medThreshold: 2,
          highThreshold: 2,
        })
      )
      .setTimeout(30)
      .build();
  
    createAccountTransaction.sign(fundingAccountKeypair);
    createAccountTransaction.sign(ephemeralKeys);
  
    try {
      await horizonServer.submitTransaction(createAccountTransaction);
    } catch (error) {
      console.error("Could not submit the offramping transaction");
      //console.error(error.response.data.extras);
    }
  
    const ephemeralAccount = await horizonServer.loadAccount(ephemeralAccountId);
    const changeTrustTransaction = new TransactionBuilder(ephemeralAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(ASSET_CODE, ASSET_ISSUER),
        })
      )
      .setTimeout(30)
      .build();
  
    changeTrustTransaction.sign(ephemeralKeys);
    changeTrustTransaction.sign(fundingAccountKeypair);

    try {
      await horizonServer.submitTransaction(changeTrustTransaction);
    } catch (error) {
      console.error("Could not submit the change trust transaction");
     // console.error(error.response.data.extras);
    }
}

async function createOfframpTransaction(sep24Result:ISep24Result  , ephemeralKeys: Keypair) {
    // this operation would run completely in the browser
    // that is where the signature of the ephemeral account is added
    const { amount, memo, offrampingAccount } = sep24Result;
    const ephemeralAccount = await horizonServer.loadAccount(ephemeralKeys.publicKey());
    const transaction = new TransactionBuilder(ephemeralAccount, {
      fee: BASE_FEE,
      networkPassphrase:  NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          amount,
          asset: new Asset(ASSET_CODE, ASSET_ISSUER),
          destination: offrampingAccount,
        })
      )
      .addMemo(Memo.text(memo))
      .setTimeout(7 * 24 * 3600)
      .build();
    transaction.sign(ephemeralKeys);
  
    return transaction;
  }
  
async function createAccountMergeTransaction(fundingSecret: string, ephemeralKeys: Keypair) {
    // this operation would run completely in the browser
    // that is where the signature of the ephemeral account is added
    const ephemeralAccount = await horizonServer.loadAccount(ephemeralKeys.publicKey());
    const transaction = new TransactionBuilder(ephemeralAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(ASSET_CODE, ASSET_ISSUER),
          limit: "0",
        })
      )
      .addOperation(
        Operation.accountMerge({
          destination: Keypair.fromSecret(fundingSecret).publicKey(),
        })
      )
      .setTimeout(7 * 24 * 3600)
      .build();
    transaction.sign(ephemeralKeys);
  
    return transaction;
  }