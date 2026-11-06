import { describe, expect, it } from "bun:test";
import { Networks, robinhoodChain } from "@vortexfi/shared";
import { encodeFunctionData, parseEther, parseSignature } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { ROBINHOOD_STOCKS } from "../../api/services/phases/blocks/core/robinhood-stocks";
import { moneriumPermitAbi } from "../../api/services/phases/blocks/phases/monerium-self-transfer/contract";
import { FakeEvm } from "./fake-evm";
import { PERMIT_TYPES, scriptRobinhoodChain, TokenLedger } from "./robinhood-chain";

const NVDA = ROBINHOOD_STOCKS.NVDA.address;
const SPENDER = "0x0000000000000000000000000000000000000abc";
const VALUE = parseEther("1");
const DEADLINE = 4_000_000_000n;

describe("TokenLedger permits", () => {
  const evm = new FakeEvm();
  scriptRobinhoodChain(evm, 1n);
  const owner = privateKeyToAccount(generatePrivateKey());
  let txCount = 0;

  async function broadcastPermit(ledger: TokenLedger, signer: PrivateKeyAccount, { name = "Fake NVDA", nonce = 0n } = {}) {
    const signature = await signer.signTypedData({
      domain: { chainId: robinhoodChain.id, name, verifyingContract: NVDA, version: "1" },
      message: { deadline: DEADLINE, nonce, owner: owner.address, spender: SPENDER, value: VALUE },
      primaryType: "Permit",
      types: PERMIT_TYPES
    });
    const { r, s, v } = parseSignature(signature);
    const hash = `0x${(++txCount).toString(16).padStart(64, "0")}` as const;
    ledger.apply({
      data: encodeFunctionData({
        abi: moneriumPermitAbi,
        args: [owner.address, SPENDER, VALUE, DEADLINE, Number(v), r, s],
        functionName: "permit"
      }),
      from: owner.address,
      hash,
      network: Networks.Robinhood,
      to: NVDA
    });
    return evm.revertedReceiptHashes.has(hash) ? "reverted" : "mined";
  }

  it("takes the owner's signature over the token's domain, and consumes its nonce", async () => {
    const ledger = new TokenLedger(evm, 1n, owner.address);

    expect(await broadcastPermit(ledger, owner)).toBe("mined");

    expect(ledger.permitNonce(NVDA, owner.address)).toBe(1n);
    expect(ledger.allowance(Networks.Robinhood, NVDA, owner.address, SPENDER)).toBe(VALUE);
    expect(await broadcastPermit(ledger, owner)).toBe("reverted");
    expect(await broadcastPermit(ledger, owner, { nonce: 1n })).toBe("mined");
  });

  it("reverts a signature from anyone else or over another domain, and the nonce stays", async () => {
    const ledger = new TokenLedger(evm, 1n, owner.address);

    expect(await broadcastPermit(ledger, privateKeyToAccount(generatePrivateKey()))).toBe("reverted");
    expect(await broadcastPermit(ledger, owner, { name: "Another token" })).toBe("reverted");

    expect(ledger.permitNonce(NVDA, owner.address)).toBe(0n);
    expect(ledger.allowance(Networks.Robinhood, NVDA, owner.address, SPENDER)).toBe(0n);
  });
});
