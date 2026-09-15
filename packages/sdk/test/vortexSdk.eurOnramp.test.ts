// VortexSdk routing for EUR/SEPA BUY: the owner permit comes back as a user-owned transaction.
// Run: cd packages/sdk && bun test

import {describe, expect, test} from "bun:test";
import {EPaymentMethod, FiatToken, Networks, RampDirection, type RampProcess, type UnsignedTx} from "@vortexfi/shared";
import type {EurOnrampQuote} from "../src/types";
import {VortexSdk} from "../src/VortexSdk";

const OWNER = "0xAbCd000000000000000000000000000000000001";

const permitTx = {
  meta: {},
  network: Networks.Polygon,
  nonce: 0,
  phase: "moneriumOnrampSelfTransfer",
  signer: OWNER.toLowerCase(),
  txData: {
    domain: { chainId: 137, name: "Monerium EURe", verifyingContract: "0x18ec0A6E18E5bc3784fDd3a3634b31245ab704F6", version: "1" },
    message: { deadline: "1800000000", nonce: "0", owner: OWNER, spender: "0xEVM", value: "1" },
    primaryType: "Permit",
    types: { Permit: [] }
  }
} as UnsignedTx;
const ephemeralTx = { ...permitTx, nonce: 1, signer: "0xEVM", txData: { data: "0x", gas: "1", to: "0x0", value: "0" } } as UnsignedTx;

const quote = {
  from: EPaymentMethod.SEPA,
  id: "quote_eur",
  inputCurrency: FiatToken.EURC,
  rampType: RampDirection.BUY,
  to: Networks.Arbitrum
} as EurOnrampQuote;

describe("VortexSdk.registerRamp for EUR/SEPA BUY", () => {
  test("returns the Monerium owner permit as the user-owned transaction", async () => {
    const sdk = new VortexSdk({ apiBaseUrl: "http://127.0.0.1:1", secretKey: "sk_test_eur", storeEphemeralKeys: false });
    const registered: unknown[] = [];
    (sdk as unknown as { eurHandler: { registerEurOnramp: unknown } }).eurHandler = {
      registerEurOnramp: async (quoteId: string, data: unknown): Promise<RampProcess> => {
        registered.push([quoteId, data]);
        return { id: "ramp_eur", unsignedTxs: [permitTx, ephemeralTx] } as RampProcess;
      }
    };

    const { rampProcess, unsignedTransactions } = await sdk.registerRamp(quote, {
      destinationAddress: "0x0000000000000000000000000000000000000002",
      walletAddress: OWNER
    });

    expect(rampProcess.id).toBe("ramp_eur");
    expect(registered).toEqual([["quote_eur", { destinationAddress: "0x0000000000000000000000000000000000000002", walletAddress: OWNER }]]);
    expect(unsignedTransactions).toEqual([permitTx]);
    expect(sdk.getUserTransactionType(unsignedTransactions[0])).toBe("evm-typed-data");
  });

  test("updateRamp points EUR BUY integrators at the permit submission helpers", async () => {
    const sdk = new VortexSdk({ apiBaseUrl: "http://127.0.0.1:1", secretKey: "sk_test_eur", storeEphemeralKeys: false });
    await expect(sdk.updateRamp(quote, "ramp_eur", undefined as never)).rejects.toThrow("submitUserTransactions");
  });
});
