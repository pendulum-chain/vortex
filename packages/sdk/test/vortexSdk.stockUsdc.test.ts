import { describe, expect, test } from "bun:test";
import { EvmToken, Networks, RampDirection, type RampProcess, type UnsignedTx } from "@vortexfi/shared";
import type { StockUsdcQuote } from "../src/types";
import { VortexSdk } from "../src/VortexSdk";

const owner = "0x1234567890123456789012345678901234567890";
const quotes: StockUsdcQuote[] = [
  {
    id: "buy",
    rampType: RampDirection.BUY,
    from: Networks.Base,
    to: Networks.Robinhood,
    inputCurrency: EvmToken.USDC
  } as StockUsdcQuote,
  {
    id: "sell",
    rampType: RampDirection.SELL,
    from: Networks.Robinhood,
    to: Networks.Base,
    outputCurrency: EvmToken.USDC
  } as StockUsdcQuote
];
const permit = (network: Networks) =>
  ({
    phase: "stockPermitTransfer",
    network,
    signer: owner,
    nonce: 0,
    meta: {},
    txData: {
      domain: {
        chainId: network === Networks.Base ? 8453 : 4663,
        verifyingContract: owner,
        version: "2",
        name: "USD Coin"
      },
      types: { Permit: [] },
      primaryType: "Permit",
      message: { owner, spender: owner, value: "100000000", nonce: "0", deadline: "1800000000" }
    }
  }) as UnsignedTx;

describe("Stock USDC registration routing", () => {
  test.each(quotes)("returns the owner's permit without invoking a fiat provider", async (quote) => {
    const sdk = new VortexSdk({
      apiBaseUrl: "http://127.0.0.1:1",
      secretKey: "sk_test_synthetic",
      storeEphemeralKeys: false,
      offrampFundingMode: "deferred"
    });
    const tx = permit(quote.rampType === RampDirection.BUY ? Networks.Base : Networks.Robinhood);
    const calls: unknown[] = [];
    (sdk as unknown as { stockUsdcHandler: unknown }).stockUsdcHandler = {
      register: async (id: string, data: unknown) => {
        calls.push([id, data]);
        return {
          id: "ramp",
          unsignedTxs: [tx, { ...tx, signer: "0x0000000000000000000000000000000000000001" }]
        } as RampProcess;
      }
    };
    const result = await sdk.registerRamp(quote, { walletAddress: owner, destinationAddress: owner });
    expect(calls).toEqual([[quote.id, { walletAddress: owner, destinationAddress: owner }]]);
    expect(result.unsignedTransactions).toEqual([tx]);
    expect(sdk.getUserTransactionType(tx)).toBe("evm-typed-data");
  });
  test("rejects a registration that does not return the wallet's authorization", async () => {
    const sdk = new VortexSdk({
      apiBaseUrl: "http://127.0.0.1:1",
      secretKey: "sk_test_synthetic",
      storeEphemeralKeys: false,
      offrampFundingMode: "deferred"
    });
    (sdk as unknown as { stockUsdcHandler: unknown }).stockUsdcHandler = {
      register: async () => ({ id: "ramp", unsignedTxs: [] })
    };
    await expect(sdk.registerRamp(quotes[0], { walletAddress: owner, destinationAddress: owner })).rejects.toThrow(
      "no permit transaction"
    );
  });
});
