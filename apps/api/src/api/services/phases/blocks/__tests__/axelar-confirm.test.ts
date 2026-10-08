import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { DirectSecp256k1Wallet, decodeTxRaw, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes, SigningStargateClient } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { hexToBytes } from "viem";
import { EVM_FUNDING_PRIVATE_KEY } from "../../../../../config/vars";
import {
  CONFIRM_GATEWAY_TXS_TYPE_URL,
  ConfirmGatewayTxsRequest,
  confirmGatewayTxFromFundingAccount
} from "../phases/squid-router-swap/axelar-confirm";

const TX_HASH = "0x9813084dfd323ae5a8638e1c24f1f21a5c43730acf3e2707d9bdc78d403e8ff7";
// Message bytes of mainnet tx A2D28977CC165EBC9145C2BC2921E70FDACAC80E8D9969F24AAC033F5A8841B6 (code 0).
const MAINNET_MESSAGE_HEX =
  "1204626173651a20a9a38edaaa05aad30dd9d65c88fdc9754bb82b1e4dbd5bf53266f45e0691ea07222d6178656c6172316563757a6834646c37666e36396c37686d7933397035387a6a676e7735747475727937307732";
const MAINNET_MESSAGE = {
  chain: "base",
  sender: "axelar1ecuzh4dl7fn69l7hmy39p58zjgnw5ttury70w2",
  txIds: [hexToBytes("0xa9a38edaaa05aad30dd9d65c88fdc9754bb82b1e4dbd5bf53266f45e0691ea07")]
};

async function fundingAxelarAddress(): Promise<string> {
  const wallet = await DirectSecp256k1Wallet.fromKey(hexToBytes(EVM_FUNDING_PRIVATE_KEY as `0x${string}`), "axelar");
  return (await wallet.getAccounts())[0].address;
}

function fakeClient(balanceUaxl: string, code = 0) {
  return {
    disconnect: mock(() => undefined),
    getBalance: mock(async () => ({ amount: balanceUaxl, denom: "uaxl" })),
    signAndBroadcast: mock(async (..._args: unknown[]) => ({ code, rawLog: "account sequence mismatch", transactionHash: "AXL_TX" })),
    simulate: mock(async () => 2_580_538)
  };
}

afterEach(() => {
  mock.restore();
});

describe("ConfirmGatewayTxsRequest", () => {
  it("encodes byte-for-byte like a confirm accepted on Axelar mainnet", () => {
    expect(Buffer.from(ConfirmGatewayTxsRequest.encode(MAINNET_MESSAGE).finish()).toString("hex")).toBe(MAINNET_MESSAGE_HEX);
  });

  it("signs into a direct-mode tx carrying the encoded message", async () => {
    const wallet = await DirectSecp256k1Wallet.fromKey(new Uint8Array(32).fill(1), "axelar");
    const [{ address }] = await wallet.getAccounts();
    const client = await SigningStargateClient.offline(wallet, {
      registry: new Registry([...defaultRegistryTypes, [CONFIRM_GATEWAY_TXS_TYPE_URL, ConfirmGatewayTxsRequest]])
    });

    const value = { ...MAINNET_MESSAGE, sender: address };
    const signed = await client.sign(
      address,
      [{ typeUrl: CONFIRM_GATEWAY_TXS_TYPE_URL, value }],
      { amount: [{ amount: "26600", denom: "uaxl" }], gas: "3800000" },
      "",
      { accountNumber: 1n, chainId: "axelar-dojo-1", sequence: 7 }
    );
    const tx = decodeTxRaw(TxRaw.encode(signed).finish());

    expect(tx.body.messages).toHaveLength(1);
    expect(tx.body.messages[0]?.typeUrl).toBe(CONFIRM_GATEWAY_TXS_TYPE_URL);
    expect(tx.body.messages[0]?.value).toEqual(ConfirmGatewayTxsRequest.encode(value).finish());
    expect(tx.authInfo.signerInfos[0]?.sequence).toBe(7n);
    expect(tx.signatures[0]).toHaveLength(64);
  });
});

describe("confirmGatewayTxFromFundingAccount", () => {
  it("confirms the source tx from the funding key's Axelar account with a simulated fee", async () => {
    const client = fakeClient("18180369");
    spyOn(SigningStargateClient, "connectWithSigner").mockResolvedValue(client as never);

    await expect(confirmGatewayTxFromFundingAccount("base", TX_HASH)).resolves.toBe("AXL_TX");

    const sender = await fundingAxelarAddress();
    expect(client.signAndBroadcast).toHaveBeenCalledWith(
      sender,
      [{ typeUrl: CONFIRM_GATEWAY_TXS_TYPE_URL, value: { chain: "base", sender, txIds: [hexToBytes(TX_HASH)] } }],
      { amount: [{ amount: "27096", denom: "uaxl" }], gas: "3870807" }
    );
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("refuses to broadcast when the Axelar account cannot pay the fee, naming the address to fund", async () => {
    const client = fakeClient("27095");
    spyOn(SigningStargateClient, "connectWithSigner").mockResolvedValue(client as never);

    await expect(confirmGatewayTxFromFundingAccount("base", TX_HASH)).rejects.toThrow(
      `Axelar account ${await fundingAxelarAddress()} holds 27095 uaxl but the confirm needs 27096 uaxl`
    );
    expect(client.signAndBroadcast).not.toHaveBeenCalled();
  });

  it("rejects a confirm the chain did not accept", async () => {
    spyOn(SigningStargateClient, "connectWithSigner").mockResolvedValue(fakeClient("18180369", 32) as never);

    await expect(confirmGatewayTxFromFundingAccount("base", TX_HASH)).rejects.toThrow("failed with code 32");
  });

  it("does nothing once the phase is aborted", async () => {
    const connect = spyOn(SigningStargateClient, "connectWithSigner");
    const controller = new AbortController();
    controller.abort(new Error("phase timed out"));

    await expect(confirmGatewayTxFromFundingAccount("base", TX_HASH, controller.signal)).rejects.toThrow("phase timed out");
    expect(connect).not.toHaveBeenCalled();
  });
});
