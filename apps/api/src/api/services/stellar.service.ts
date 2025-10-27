import { getTokenConfigByAssetCode, StellarTokenConfig, TOKEN_CONFIG } from "@packages/shared";
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "stellar-sdk";
import { HORIZON_URL, SANDBOX_ENABLED, STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS } from "../../constants/constants";

interface CreationTxResult {
  signature: string;
  sequence: string;
}

// Constants
export const horizonServer = new Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = SANDBOX_ENABLED ? Networks.TESTNET : Networks.PUBLIC;

async function buildCreationStellarTx(
  fundingSecret: string,
  ephemeralAccountId: string,
  maxTime: number,
  assetCode: string,
  baseFee: string
): Promise<CreationTxResult> {
  const tokenConfig = getTokenConfigByAssetCode(TOKEN_CONFIG, assetCode) as StellarTokenConfig;
  if (!tokenConfig) {
    throw new Error("Invalid asset id or configuration not found");
  }

  const fundingAccountKeypair = Keypair.fromSecret(fundingSecret);
  const fundingAccountId = fundingAccountKeypair.publicKey();
  const fundingAccount = await horizonServer.loadAccount(fundingAccountId);
  const fundingSequence = fundingAccount.sequence;
  // add a setOption oeration in order to make this a 2-of-2 multisig account where the
  // funding account is a cosigner
  const createAccountTransaction = new TransactionBuilder(fundingAccount, {
    fee: baseFee,
    networkPassphrase: NETWORK_PASSPHRASE
  })
    .addOperation(
      Operation.createAccount({
        destination: ephemeralAccountId,
        startingBalance: STELLAR_EPHEMERAL_STARTING_BALANCE_UNITS
      })
    )
    .addOperation(
      Operation.setOptions({
        highThreshold: 2,
        lowThreshold: 2,
        medThreshold: 2,
        signer: { ed25519PublicKey: fundingAccountId, weight: 1 },
        source: ephemeralAccountId
      })
    )
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(tokenConfig.assetCode, tokenConfig.assetIssuer),
        source: ephemeralAccountId
      })
    )
    .setTimebounds(0, maxTime)
    .build();

  return {
    sequence: fundingSequence,
    signature: createAccountTransaction.getKeypairSignature(fundingAccountKeypair)
  };
}

export { buildCreationStellarTx };
