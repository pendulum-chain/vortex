import { ApiPromise, Keyring } from "@polkadot/api";
import { AddressOrPair } from "@polkadot/api/types";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, hdEthereum, mnemonicToLegacySeed } from "@polkadot/util-crypto";
import { Keypair, Networks as StellarNetworks, Transaction } from "stellar-sdk";
import { createWalletClient, http, WalletClient, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { moonbeam, polygon } from "viem/chains";
import {
  decodeSubmittableExtrinsic,
  EphemeralAccount,
  isEvmTransactionData,
  MOONBEAM_WSS,
  Networks,
  PresignedTx,
  SANDBOX_ENABLED,
  UnsignedTx
} from "../index";
import logger from "../logger";

// Number of transactions to pre-sign for each transaction
const NUMBER_OF_PRESIGNED_TXS = 5;

export function addAdditionalTransactionsToMeta(primaryTx: PresignedTx, multiSignedTxs: PresignedTx[]): PresignedTx {
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
  networkPassphrase: string
): Promise<PresignedTx> {
  const transaction = new Transaction(tx.txData as string, networkPassphrase);
  transaction.sign(keypair);

  const primarySignedTxData = transaction.toEnvelope().toXDR().toString("base64");

  const signedTx: PresignedTx = {
    ...tx,
    txData: primarySignedTxData
  };
  // iterate objects of array meta
  for (const key in signedTx.meta.additionalTxs) {
    if (!key.includes(tx.phase)) continue;

    const extraTransactionUnsigned = signedTx.meta.additionalTxs[key].txData;
    const extraTransaction = new Transaction(extraTransactionUnsigned as string, networkPassphrase);
    extraTransaction.sign(keypair);

    const extraTransactionSigned = extraTransaction.toEnvelope().toXDR().toString("base64");
    signedTx.meta.additionalTxs[key].txData = extraTransactionSigned;
  }
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
  keypair: AddressOrPair,
  api: ApiPromise,
  startingNonce: number
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const currentNonce = startingNonce + i;
    const extrinsic = decodeSubmittableExtrinsic(tx.txData as string, api);

    await extrinsic.signAsync(keypair, { era: 0, nonce: currentNonce });

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
 * Creates wallet clients for both Moonbeam and Polygon networks using the same ephemeral secret
 *
 * @param moonbeamEphemeral - The ephemeral account containing the secret
 * @param alchemyApiKey - Optional Alchemy API key for Polygon transport
 * @returns Object containing both wallet clients
 */
function createEvmWalletClients(
  moonbeamEphemeral: EphemeralAccount,
  alchemyApiKey?: string
): { moonbeamClient: WalletClient; polygonClient: WalletClient } {
  const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;

  const privateKey = u8aToHex(hdEthereum(mnemonicToLegacySeed(moonbeamEphemeral.secret, "", false, 64), ethDerPath).secretKey);
  const evmAccount = privateKeyToAccount(privateKey);
  const moonbeamClient = createWalletClient({
    account: evmAccount,
    chain: moonbeam,
    transport: alchemyApiKey ? http(`https://moonbeam-mainnet.g.alchemy.com/v2/${alchemyApiKey}`) : webSocket(MOONBEAM_WSS)
  });

  const polygonTransport = alchemyApiKey ? http(`https://polygon-mainnet.g.alchemy.com/v2/${alchemyApiKey}`) : http();
  const polygonClient = createWalletClient({
    account: evmAccount,
    chain: polygon,
    transport: polygonTransport
  });

  return { moonbeamClient, polygonClient };
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
  walletClient: WalletClient,
  startingNonce: number
): Promise<PresignedTx[]> {
  const signedTxs: PresignedTx[] = [];

  if (!isEvmTransactionData(tx.txData)) {
    throw new Error("Invalid EVM transaction data format");
  }

  for (let i = 0; i < NUMBER_OF_PRESIGNED_TXS; i++) {
    const currentNonce = startingNonce + i;

    // Ensure the transaction data is in the correct format

    if (!walletClient.account) {
      throw new Error("Wallet client account is undefined");
    }

    const txData = {
      account: walletClient.account,
      chain: walletClient.chain,
      data: tx.txData.data,
      gas: BigInt(tx.txData.gas),
      maxFeePerGas: tx.txData.maxFeePerGas ? BigInt(tx.txData.maxFeePerGas) * 5n : BigInt(187500000000),
      maxPriorityFeePerGas: tx.txData.maxPriorityFeePerGas ? BigInt(tx.txData.maxPriorityFeePerGas) * 5n : BigInt(187500000000),
      nonce: Number(currentNonce),
      to: tx.txData.to,
      value: BigInt(tx.txData.value)
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
    substrateEphemeral?: EphemeralAccount;
    evmEphemeral?: EphemeralAccount;
  },
  pendulumApi: ApiPromise,
  moonbeamApi: ApiPromise,
  hydrationApi: ApiPromise,
  alchemyApiKey?: string
): Promise<PresignedTx[]> {
  // Wait for initialization of crypto libraries
  await cryptoWaitReady();

  const signedTxs: PresignedTx[] = [];

  // Create EVM wallet clients once at the beginning if needed
  let evmClients: { moonbeamClient: WalletClient; polygonClient: WalletClient } | null = null;
  const moonbeamTxs = unsignedTxs.filter(tx => tx.network === Networks.Moonbeam);
  const polygonTxs = unsignedTxs.filter(tx => tx.network === Networks.Polygon || tx.network === Networks.PolygonAmoy);
  const hydrationTxs = unsignedTxs.filter(tx => tx.network === Networks.Hydration);

  if ((moonbeamTxs.length > 0 || polygonTxs.length > 0) && ephemerals.evmEphemeral) {
    evmClients = createEvmWalletClients(ephemerals.evmEphemeral, alchemyApiKey);
  }

  try {
    const stellarTxs = unsignedTxs.filter(tx => tx.network === "stellar").sort((a, b) => a.nonce - b.nonce);
    const pendulumTxs = unsignedTxs.filter(tx => tx.network === "pendulum");

    // Process Stellar transactions first in sequence order
    if (stellarTxs.length > 0) {
      if (!ephemerals.stellarEphemeral) {
        throw new Error("Missing Stellar ephemeral account");
      }

      const keypair = Keypair.fromSecret(ephemerals.stellarEphemeral.secret);

      for (const tx of stellarTxs) {
        if (isEvmTransactionData(tx.txData)) {
          throw new Error("Invalid Stellar transaction data format");
        }

        const networkPassphrase = SANDBOX_ENABLED ? StellarNetworks.TESTNET : StellarNetworks.PUBLIC;
        const txWithMeta = await signMultipleStellarTransactions(tx, keypair, networkPassphrase);
        signedTxs.push(txWithMeta);
      }
    }

    for (const tx of hydrationTxs) {
      if (!ephemerals.substrateEphemeral) {
        throw new Error("Missing Substrate ephemeral account");
      }

      if (!hydrationApi) {
        throw new Error("Hydration API is required for signing transactions");
      }

      if (isEvmTransactionData(tx.txData)) {
        throw new Error("Invalid Hydration transaction data format");
      }

      const keyring = new Keyring({ type: "sr25519" });
      const keypair = keyring.addFromUri(ephemerals.substrateEphemeral.secret);

      const multiSignedTxs = await signMultipleSubstrateTransactions(tx, keypair, hydrationApi, tx.nonce);

      const primaryTx = multiSignedTxs[0];

      const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

      signedTxs.push(txWithMeta);
    }

    for (const tx of pendulumTxs) {
      if (!ephemerals.substrateEphemeral) {
        throw new Error("Missing Pendulum ephemeral account");
      }

      if (!pendulumApi) {
        throw new Error("Pendulum API is required for signing transactions");
      }

      if (isEvmTransactionData(tx.txData)) {
        throw new Error("Invalid Pendulum transaction data format");
      }

      const keyring = new Keyring({ type: "sr25519" });
      const keypair = keyring.addFromUri(ephemerals.substrateEphemeral.secret);

      const multiSignedTxs = await signMultipleSubstrateTransactions(tx, keypair, pendulumApi, tx.nonce);

      const primaryTx = multiSignedTxs[0];

      const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

      signedTxs.push(txWithMeta);
    }

    // Process Moonbeam transactions
    for (const tx of moonbeamTxs) {
      if (!ephemerals.evmEphemeral) {
        throw new Error("Missing EVM ephemeral account");
      }

      if (!evmClients) {
        throw new Error("EVM clients not initialized");
      }

      const ethDerPath = `m/44'/60'/${0}'/${0}/${0}`;

      if (isEvmTransactionData(tx.txData)) {
        const multiSignedTxs = await signMultipleEvmTransactions(tx, evmClients.moonbeamClient, tx.nonce);

        const primaryTx = multiSignedTxs[0];

        const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

        signedTxs.push(txWithMeta);
      } else {
        const keyring = new Keyring({ type: "ethereum" });
        const keypair = keyring.addFromUri(`${ephemerals.evmEphemeral.secret}/${ethDerPath}`);

        const multiSignedTxs = await signMultipleSubstrateTransactions(tx, keypair, moonbeamApi, tx.nonce);

        const primaryTx = multiSignedTxs[0];

        const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

        signedTxs.push(txWithMeta);
      }
    }

    // Process Polygon transactions
    for (const tx of polygonTxs) {
      if (!ephemerals.evmEphemeral) {
        throw new Error("Missing EVM ephemeral account");
      }

      if (!evmClients) {
        throw new Error("EVM clients not initialized");
      }

      const multiSignedTxs = await signMultipleEvmTransactions(tx, evmClients.polygonClient, tx.nonce);
      const primaryTx = multiSignedTxs[0];
      const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

      signedTxs.push(txWithMeta);
    }
  } catch (error) {
    logger.current.error("Error signing transactions:", error);
    throw error;
  }

  return signedTxs;
}
