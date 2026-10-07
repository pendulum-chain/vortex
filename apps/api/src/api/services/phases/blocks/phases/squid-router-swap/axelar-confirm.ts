import { DirectSecp256k1Wallet, Registry } from "@cosmjs/proto-signing";
import { calculateFee, defaultRegistryTypes, GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { BinaryWriter } from "cosmjs-types/binary";
import pLimit from "p-limit";
import { type Hex, hexToBytes } from "viem";
import { EVM_FUNDING_PRIVATE_KEY } from "../../../../../../config/vars";
import { throwIfAborted } from "../../core/cancellation";

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

// ponytail: serializes per process only. Two API instances confirming at the same moment collide
// on the account sequence (code 32); the loser retries after the recovery cooldown.
const confirmQueue = pLimit(1);

/**
 * Restarts a failed Axelar validator poll by submitting ConfirmGatewayTxs from the Axelar account
 * of the EVM funding key (a plain secp256k1 key, so it also controls an axelar1… address). The
 * message is permissionless (ROLE_UNRESTRICTED); one call costs about 0.025 AXL.
 *
 * @returns The Axelar transaction hash of the included ConfirmGatewayTxs
 */
export async function confirmGatewayTxFromFundingAccount(
  sourceChain: string,
  txHash: string,
  signal?: AbortSignal
): Promise<string> {
  if (!EVM_FUNDING_PRIVATE_KEY) {
    throw new Error("EVM_FUNDING_PRIVATE_KEY is not configured; cannot sign Axelar confirms");
  }
  const wallet = await DirectSecp256k1Wallet.fromKey(hexToBytes(EVM_FUNDING_PRIVATE_KEY as Hex), "axelar");

  return confirmQueue(async () => {
    throwIfAborted(signal);
    const [{ address: sender }] = await wallet.getAccounts();
    const client = await SigningStargateClient.connectWithSigner(AXELAR_RPC_URL, wallet, {
      gasPrice: AXELAR_GAS_PRICE,
      registry: new Registry([...defaultRegistryTypes, [CONFIRM_GATEWAY_TXS_TYPE_URL, ConfirmGatewayTxsRequest]])
    });
    try {
      const message = {
        typeUrl: CONFIRM_GATEWAY_TXS_TYPE_URL,
        value: { chain: sourceChain, sender, txIds: [hexToBytes(txHash as Hex)] }
      };
      const gas = await client.simulate(sender, [message], undefined);
      const fee = calculateFee(Math.round(gas * GAS_MULTIPLIER), AXELAR_GAS_PRICE);
      const feeUaxl = fee.amount[0].amount;
      const { amount: balanceUaxl } = await client.getBalance(sender, "uaxl");
      if (BigInt(balanceUaxl) < BigInt(feeUaxl)) {
        throw new Error(
          `Axelar account ${sender} holds ${balanceUaxl} uaxl but the confirm needs ${feeUaxl} uaxl; send it AXL on the Axelar network`
        );
      }

      throwIfAborted(signal);
      const result = await client.signAndBroadcast(sender, [message], fee);
      if (result.code !== 0) {
        throw new Error(`ConfirmGatewayTxs ${result.transactionHash} failed with code ${result.code}: ${result.rawLog}`);
      }
      return result.transactionHash;
    } finally {
      client.disconnect();
    }
  });
}
