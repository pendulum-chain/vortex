import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Keyring } from "@polkadot/api";
import { Transaction, Keypair, Networks as StellarNetworks } from "stellar-sdk";
import { ApiPromise } from "@polkadot/api";
import { moonbeam } from "viem/chains";
import {
  isEvmTransactionData,
  PresignedTx,
  UnsignedTx,
  EphemeralAccount,
  decodeSubmittableExtrinsic,
} from "../index";
import { u8aToHex } from "@polkadot/util";
import { hdEthereum, mnemonicToLegacySeed } from "@polkadot/util-crypto";

// Number of transactions to pre-sign for each transaction
const NUMBER_OF_PRESIGNED_TXS = 3;

export function addAdditionalTransactionsToMeta(
  primaryTx: PresignedTx,
  multiSignedTxs: PresignedTx[]
): PresignedTx {
  if (multiSignedTxs.length <= 1) {
    return primaryTx;
  }
  
  const additionalTxs: Record<string, PresignedTx> = {};
  
  for (let i = 1; i < multiSignedTxs.length; i++) {
    const additionalTx = multiSignedTxs[i];
    const nonceOffset = i;

    const txName = `${primaryTx.phase}${nonceOffset}`;
    additionalTxs[txName] = additionalTx;
  }
  
  return {
    ...primaryTx,
    meta: { ...primaryTx.meta, additionalTxs }
  };
}

/**
 * Signs multiple Stellar transactions with increasing sequence numbers
 * 
 * @param tx - The original backend-signed transaction. Can contain meta field with multiple-nonce transactions.
 * @param keypair - The Stellar keypair to sign with
 * @param networkPassphrase - The Stellar network passphrase
 * @param startingNonce - The starting nonce/sequence number value
 * @returns - Multi-nonce presigned transaction object.
 */
async function signMultipleStellarTransactions(
  tx: UnsignedTx,
  keypair: Keypair,
  networkPassphrase: string,
): Promise<PresignedTx> {

  const transaction = new Transaction(tx.txData as string, networkPassphrase);
  transaction.sign(keypair);
    
  const primarySignedTxData = transaction
    .toEnvelope()
    .toXDR()
    .toString("base64");
    
  const signedTx: PresignedTx = {
    ...tx,
    txData: primarySignedTxData
  };
  // iterate objects of array meta
  for (const key in signedTx.meta.additionalTxs) {
    console.log(`key: ${key}`);
    console.log(`value: ${signedTx.meta[key]}`);
    if (!key.includes(tx.phase)) continue;

    const extraTransactionUnsigned = signedTx.meta.additionalTxs[key].txData;
    const extraTransaction = new Transaction(extraTransactionUnsigned as string, networkPassphrase);
    extraTransaction.sign(keypair);

    const extraTransactionSigned = extraTransaction
      .toEnvelope()
      .toXDR()
      .toString("base64");
    signedTx.meta.additionalTxs[key].txData = extraTransactionSigned;

  };
  
  return signedTx;
}

/**
 * Signs multiple Substrate (Pendulum) transactions with increasing nonces
 * 
 * @param tx - The original unsigned transaction
 * @param keypair - The keypair to sign with
 * @param api - The Polkadot API instance
 * @param startingNonce - The starting nonce value
 * @returns - Array of signed transactions with increasing nonces
 */
async function signMultipleSubstrateTransactions(
  tx: UnsignedTx,
  keypair: any,
  api: ApiPromise,
  startingNonce: number
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];
  
  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const currentNonce = startingNonce + i;
    const extrinsic = decodeSubmittableExtrinsic(tx.txData as string, api);
    
    await extrinsic.signAsync(keypair, { nonce: currentNonce, era: 0 });
    
    const signedTxData = extrinsic.toHex();
    const signedTx: PresignedTx = { 
      ...tx,
      nonce: currentNonce,
      txData: signedTxData
    };
    
    signedTxs.push(signedTx);
  }
  
  return signedTxs;
}

/**
 * Signs multiple EVM (Moonbeam) transactions with increasing nonces
 * 
 * @param tx - The original unsigned transaction
 * @param walletClient - The viem wallet client
 * @param startingNonce - The starting nonce value
 * @returns - Array of signed transactions with increasing nonces
 */
async function signMultipleEvmTransactions(
  tx: UnsignedTx,
  walletClient: any,
  startingNonce: number
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];
  
  if (!isEvmTransactionData(tx.txData)) {
    throw new Error("Invalid EVM transaction data format");
  }

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const currentNonce = startingNonce + i;
    
    // Ensure the transaction data is in the correct format
    const txData = { 
      to: tx.txData.to,
      data: tx.txData.data,
      value: BigInt(tx.txData.value),
      nonce: Number(currentNonce),
      gas: BigInt(tx.txData.gas),
      maxFeePerGas: tx.txData.maxFeePerGas ? BigInt(tx.txData.maxFeePerGas) * 5n : BigInt(187500000000),
      maxPriorityFeePerGas: tx.txData.maxPriorityFeePerGas ? BigInt(tx.txData.maxPriorityFeePerGas) * 5n : BigInt(187500000000),
    };
    
    const signedTxData = await walletClient.signTransaction(txData);
    
    const signedTx: PresignedTx = {
      ...tx,
      nonce: currentNonce,
      txData: signedTxData
    };
    
    signedTxs.push(signedTx);
  }
  
  return signedTxs;
}

/**
 * Signs an array of unsigned transactions using network-specific methods.
 * It signs multiple transactions with increasing nonces and includes them in the meta field.
 *
 * The signUnsignedTransactions function receives:
 * - unsignedTxs: an array of UnsignedTx
 * - ephemerals: an object mapping networks to EphemeralAccount for Stellar, Pendulum (substrate),
 *   and EVM (Moonbeam) transactions.
 *
 * For each unsigned transaction, the function selects the appropriate signing method:
 *
 * • Stellar:
 *   - Uses stellar-sdk to create a Transaction from the provided XDR (tx_data).
 *   - Signs using the ephemeral key (assumed to be passed).
 *   - Signs NUMBER_OF_PRESIGNED_TXS transactions with increasing nonces.
 *
 * • Pendulum (substrate):
 *   - Uses @polkadot/api Keyring to generate a keypair from the ephemeral secret.
 *   - Simulates signing via extrinsic.signAsync with options { nonce, era }.
 *   - Signs NUMBER_OF_PRESIGNED_TXS transactions with increasing nonces.
 *
 * • Moonbeam (EVM):
 *   - Uses the viem client to create a wallet client for EVM transactions.
 *   - Signs the transaction via walletClient.signTransaction.
 *   - Signs NUMBER_OF_PRESIGNED_TXS transactions with increasing nonces.
 *
 * For each transaction, signed transactions with nonces > n (where n is the original specified nonce)
 * are stored in the meta.additionalTxs field of the first transaction. Each transaction is named
 * by its phase property appended with the nonce offset (e.g., "phase1", "phase2" for nonce+1, nonce+2).
 *
 * @param unsignedTxs - Array of transactions to be signed.
 * @param ephemerals - Mapping from network to its corresponding EphemeralAccount.
 *                     Expected keys: stellar, pendulum, evm.
 * @param pendulumApi - ApiPromise instance for Pendulum transactions.
 * @param moonbeamApi - ApiPromise instance for Moonbeam transactions.
 * @returns Promise resolving to an array of SignedTx with additional signed transactions in meta fields.
 */
export async function signUnsignedTransactions(
  unsignedTxs: UnsignedTx[],
  ephemerals: {
    stellarEphemeral?: EphemeralAccount;
    pendulumEphemeral?: EphemeralAccount;
    moonbeamEphemeral?: EphemeralAccount;
  },
  pendulumApi: ApiPromise,
  moonbeamApi: ApiPromise,
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];

  try {
    const stellarTxs = unsignedTxs
      .filter((tx) => tx.network === "stellar")
      .sort((a, b) => a.nonce - b.nonce);
    const pendulumTxs = unsignedTxs.filter((tx) => tx.network === "pendulum");
    const moonbeamTxs = unsignedTxs.filter((tx) => tx.network === "moonbeam");

    // Process Stellar transactions first in sequence order
    if (stellarTxs.length > 0) {
      if (!ephemerals.stellarEphemeral) {
        throw new Error("Missing Stellar ephemeral account");
      }

      const networkPassphrase = StellarNetworks.PUBLIC;
      const keypair = Keypair.fromSecret(ephemerals.stellarEphemeral.secret);

      for (const tx of stellarTxs) {
        if (isEvmTransactionData(tx.txData)) {
          throw new Error("Invalid Stellar transaction data format");
        }

        const txWithMeta = await signMultipleStellarTransactions(tx, keypair, networkPassphrase);
        signedTxs.push(txWithMeta);
      }
    }

    for (const tx of pendulumTxs) {
      if (!ephemerals.pendulumEphemeral) {
        throw new Error("Missing Pendulum ephemeral account");
      }

      if (!pendulumApi) {
        throw new Error("Pendulum API is required for signing transactions");
      }

      if (isEvmTransactionData(tx.txData)) {
        throw new Error("Invalid Pendulum transaction data format");
      }

      const keyring = new Keyring({ type: "sr25519" });
      const keypair = keyring.addFromUri(ephemerals.pendulumEphemeral.secret);

      const multiSignedTxs = await signMultipleSubstrateTransactions(
        tx,
        keypair,
        pendulumApi,
        tx.nonce
      );
      
      const primaryTx = multiSignedTxs[0];
    
      const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);
      
      signedTxs.push(txWithMeta);
    }

    // Process Moonbeam transactions
    for (const tx of moonbeamTxs) {
      if (!ephemerals.moonbeamEphemeral) {
        throw new Error("Missing EVM ephemeral account");
      }
      
      const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;
      
      if (isEvmTransactionData(tx.txData)) {
        const privateKey = u8aToHex(
          hdEthereum(mnemonicToLegacySeed(ephemerals.moonbeamEphemeral.secret, '', false, 64), ethDerPath)
            .secretKey
        );
        const evmAccount = privateKeyToAccount(privateKey);
  
        const walletClient = createWalletClient({
          account: evmAccount,
          chain: moonbeam,
          transport: http(),
        });

        const multiSignedTxs = await signMultipleEvmTransactions(
          tx,
          walletClient,
          tx.nonce
        );
        
        const primaryTx = multiSignedTxs[0];
      
        const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);
        
        signedTxs.push(txWithMeta);
      } else {
        const keyring = new Keyring({ type: 'ethereum' });
        const keypair = keyring.addFromUri(`${ephemerals.moonbeamEphemeral.secret}/${ethDerPath}`);
        
        const multiSignedTxs = await signMultipleSubstrateTransactions(
          tx,
          keypair,
          moonbeamApi,
          tx.nonce
        );
        
        const primaryTx = multiSignedTxs[0];
        
        const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);
        
        signedTxs.push(txWithMeta);
      }
    }
  } catch (error) {
    console.error("Error signing transactions:", error);
    throw error;
  }

  return signedTxs;
}
