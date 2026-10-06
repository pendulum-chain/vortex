import { describe, expect, it } from "bun:test";
import { DirectSecp256k1Wallet, decodeTxRaw, Registry } from "@cosmjs/proto-signing";
import { defaultRegistryTypes, SigningStargateClient } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { CONFIRM_GATEWAY_TXS_TYPE_URL, ConfirmGatewayTxsRequest } from "./axelar-confirm-gateway-tx";

// Message bytes of mainnet tx A2D28977CC165EBC9145C2BC2921E70FDACAC80E8D9969F24AAC033F5A8841B6 (code 0).
const MAINNET_MESSAGE_HEX =
  "1204626173651a20a9a38edaaa05aad30dd9d65c88fdc9754bb82b1e4dbd5bf53266f45e0691ea07222d6178656c6172316563757a6834646c37666e36396c37686d7933397035387a6a676e7735747475727937307732";
const MAINNET_MESSAGE = {
  chain: "base",
  sender: "axelar1ecuzh4dl7fn69l7hmy39p58zjgnw5ttury70w2",
  txIds: [Buffer.from("a9a38edaaa05aad30dd9d65c88fdc9754bb82b1e4dbd5bf53266f45e0691ea07", "hex")]
};

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
