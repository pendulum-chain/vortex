import { ApiPromise, Keyring } from "@polkadot/api";
import { AddressOrPair } from "@polkadot/api/types";
import { hexToU8a } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { Keypair, Networks as StellarNetworks, Transaction } from "stellar-sdk";
import { createWalletClient, fallback, http, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, avalanche, base, bsc, mainnet, moonbeam, polygon, polygonAmoy } from "viem/chains";
import {
  decodeSubmittableExtrinsic,
  EphemeralAccount,
  isEvmTransactionData,
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
 * Signs multiple Substrate transactions with increasing nonces
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
 * Creates a wallet client for a specific EVM network using the ephemeral secret
 *
 * @param network - The network enum to create the client for
 * @param evmEphemeral - The ephemeral account containing the secret
 * @param apiKey - Optional Alchemy API key
 * @returns WalletClient for the specified network
 */
function createEvmClient(
  network: string, // Accept string to match UnsignedTx.network type usually being string/enum
  evmEphemeral: EphemeralAccount,
  apiKey?: string
): WalletClient {
  const privateKey = evmEphemeral.secret as `0x${string}`;
  const evmAccount = privateKeyToAccount(privateKey);

  let chain;
  let rpcUrls: string[] = [];

  switch (network) {
    case Networks.Polygon:
      chain = polygon;
      rpcUrls = apiKey ? [`https://polygon-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    case Networks.PolygonAmoy:
      chain = polygonAmoy;
      rpcUrls = ["https://polygon-amoy.api.onfinality.io/public"];
      break;
    case Networks.Moonbeam:
      chain = moonbeam;
      rpcUrls = ["https://rpc.api.moonbeam.network", "https://moonbeam-rpc.publicnode.com"];
      break;
    case Networks.Arbitrum:
      chain = arbitrum;
      rpcUrls = apiKey ? [`https://arb-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    case Networks.Avalanche:
      chain = avalanche;
      rpcUrls = apiKey ? [`https://avax-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    case Networks.Base:
      chain = base;
      rpcUrls = apiKey ? [`https://base-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    case Networks.BSC:
      chain = bsc;
      rpcUrls = apiKey ? [`https://bnb-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    case Networks.Ethereum:
      chain = mainnet;
      rpcUrls = apiKey ? [`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`] : [];
      break;
    default:
      throw new Error(`Unsupported or unconfigured EVM network: ${network}`);
  }

  const transports = rpcUrls.filter(url => url !== "").map(url => http(url));
  transports.push(http()); //  add default viem transport as last resort

  return createWalletClient({
    account: evmAccount,
    chain: chain,
    transport: fallback(transports)
  });
}

/**
 * Signs multiple EVM transactions with increasing nonces
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

  // Group transactions
  const moonbeamTxs = unsignedTxs.filter(tx => tx.network === Networks.Moonbeam);
  const polygonTxs = unsignedTxs.filter(tx => tx.network === Networks.Polygon || tx.network === Networks.PolygonAmoy);
  const hydrationTxs = unsignedTxs.filter(tx => tx.network === Networks.Hydration);
  const destinationNetworkTxs = unsignedTxs.filter(tx => tx.phase === "destinationTransfer");

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

    //  Process Pendulum transactions
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

      if (isEvmTransactionData(tx.txData)) {
        const client = createEvmClient(Networks.Moonbeam, ephemerals.evmEphemeral, alchemyApiKey);
        const multiSignedTxs = await signMultipleEvmTransactions(tx, client, tx.nonce);
        const primaryTx = multiSignedTxs[0];
        const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

        signedTxs.push(txWithMeta);
      } else {
        // Handle Moonbeam Substrate transactions
        const keyring = new Keyring({ type: "ethereum" });
        const privateKey = ephemerals.evmEphemeral.secret as `0x${string}`;
        const keypair = keyring.addFromSeed(hexToU8a(privateKey));

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

      const client = createEvmClient(tx.network, ephemerals.evmEphemeral, alchemyApiKey);
      const multiSignedTxs = await signMultipleEvmTransactions(tx, client, tx.nonce);
      const primaryTx = multiSignedTxs[0];
      const txWithMeta = addAdditionalTransactionsToMeta(primaryTx, multiSignedTxs);

      signedTxs.push(txWithMeta);
    }

    // Process Destination Network (EVM) transactions
    for (const tx of destinationNetworkTxs) {
      if (!ephemerals.evmEphemeral) {
        throw new Error("Missing EVM ephemeral account");
      }

      // Check if already signed to avoid duplication
      const alreadySigned = signedTxs.some(st => st === tx || (st.txData === tx.txData && st.nonce === tx.nonce));
      if (alreadySigned) continue;

      const client = createEvmClient(tx.network, ephemerals.evmEphemeral, alchemyApiKey);
      const multiSignedTxs = await signMultipleEvmTransactions(tx, client, tx.nonce);
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
