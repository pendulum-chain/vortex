import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet, Registry } from "@cosmjs/proto-signing";
import { calculateFee, defaultRegistryTypes, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { classifyGmpStatus, getStatusAxelarScan } from "@vortexfi/shared";
import { BinaryWriter } from "cosmjs-types/binary";

/**
 * Restarts a failed Axelar confirm poll by submitting ConfirmGatewayTxs from our own Axelar
 * account. Fallback for when Axelar's public signing relayer (used by recoverAxelarStuckConfirm)
 * returns txs signed with a stale sequence, so every broadcast is rejected with code 32.
 * The message is permissionless (ROLE_UNRESTRICTED); one call costs about 0.025 AXL.
 *
 * Usage, from apps/api:
 *   AXELAR_CONFIRM_SIGNER_KEY="<mnemonic or hex private key>" bun src/scripts/axelar-confirm-gateway-tx.ts <source tx hash> [--broadcast]
 * Without --broadcast it only simulates the transaction.
 */

const AXELAR_RPC_URL = "https://mainnet.rpc.axelar.dev/chain/axelar";
const AXELAR_GAS_PRICE = GasPrice.fromString("0.007uaxl");
const GAS_MULTIPLIER = 1.5;
export const CONFIRM_GATEWAY_TXS_TYPE_URL = "/axelar.evm.v1beta1.ConfirmGatewayTxsRequest";

interface ConfirmGatewayTxs {
  chain: string;
  sender: string;
  txIds: Uint8Array[];
}

// axelar.evm.v1beta1.ConfirmGatewayTxsRequest (axelar-core v1.5.3 tx.proto): chain = 2,
// tx_ids = 3, sender = 4 (bech32 string). Field 1 is the deprecated byte-encoded sender.
export const ConfirmGatewayTxsRequest = {
  decode(): ConfirmGatewayTxs {
    throw new Error("Decoding ConfirmGatewayTxsRequest is not supported");
  },
  encode(message: ConfirmGatewayTxs, writer = BinaryWriter.create()): BinaryWriter {
    writer.uint32(18).string(message.chain);
    for (const txId of message.txIds) writer.uint32(26).bytes(txId);
    return writer.uint32(34).string(message.sender);
  },
  fromPartial: (message: ConfirmGatewayTxs) => message
};

async function main(): Promise<void> {
  const txHash = process.argv.slice(2).find(arg => !arg.startsWith("--"));
  const broadcast = process.argv.includes("--broadcast");
  const key = process.env.AXELAR_CONFIRM_SIGNER_KEY?.trim();
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error("Usage: bun src/scripts/axelar-confirm-gateway-tx.ts <0x source tx hash> [--broadcast]");
  }
  if (!key) {
    throw new Error("AXELAR_CONFIRM_SIGNER_KEY is not set (mnemonic or 32-byte hex private key)");
  }

  // Only a failed, unapproved poll needs a new confirm; anything else would just burn the fee.
  const status = await getStatusAxelarScan(txHash);
  const classification = classifyGmpStatus(status);
  const chain = status?.call?.chain;
  if (classification !== "source_confirmation_stuck" || !chain) {
    throw new Error(`Axelarscan reports ${txHash} as ${classification} (source chain ${chain}); not confirming`);
  }

  const wallet = /^(0x)?[0-9a-fA-F]{64}$/.test(key)
    ? await DirectSecp256k1Wallet.fromKey(Buffer.from(key.replace(/^0x/, ""), "hex"), "axelar")
    : await DirectSecp256k1HdWallet.fromMnemonic(key, { prefix: "axelar" });
  const [{ address: sender }] = await wallet.getAccounts();
  const client = await SigningStargateClient.connectWithSigner(AXELAR_RPC_URL, wallet, {
    gasPrice: AXELAR_GAS_PRICE,
    registry: new Registry([...defaultRegistryTypes, [CONFIRM_GATEWAY_TXS_TYPE_URL, ConfirmGatewayTxsRequest]])
  });
  const message = {
    typeUrl: CONFIRM_GATEWAY_TXS_TYPE_URL,
    value: { chain, sender, txIds: [Buffer.from(txHash.slice(2), "hex")] }
  };

  const balance = await client.getBalance(sender, "uaxl");
  const gas = await client.simulate(sender, [message], undefined);
  const fee = calculateFee(Math.round(gas * GAS_MULTIPLIER), AXELAR_GAS_PRICE);
  console.log(
    `Signer ${sender} holds ${balance.amount} uaxl; confirming ${txHash} on ${chain} simulates to ${gas} gas, fee ${fee.amount[0].amount} uaxl`
  );
  if (!broadcast) {
    console.log("Dry run only; pass --broadcast to submit.");
    return;
  }

  const result = await client.signAndBroadcast(sender, [message], fee);
  if (result.code !== 0) {
    throw new Error(`ConfirmGatewayTxs ${result.transactionHash} failed with code ${result.code}: ${result.rawLog}`);
  }
  console.log(
    `Broadcast ConfirmGatewayTxs ${result.transactionHash} at height ${result.height}; follow https://axelarscan.io/gmp/${txHash}`
  );
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
