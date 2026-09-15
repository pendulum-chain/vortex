// EUR (Monerium) onramp coverage: the handler registers with the linked wallet, signs only the
// ephemeral-owned transactions, and leaves the owner permit for the integrator's wallet.
// Run: cd packages/sdk && bun test

import {describe, expect, test} from "bun:test";
import {
  EPaymentMethod,
  EphemeralAccountType,
  FiatToken,
  Networks,
  PresignedTx,
  RampDirection,
  RampProcess,
  RegisterRampRequest,
  UnsignedTx,
  UpdateRampRequest
} from "@vortexfi/shared";
import {MissingEurOnrampParametersError} from "../src/errors";
import {EurHandler} from "../src/handlers/EurHandler";
import {ApiService} from "../src/services/ApiService";
import type {VortexSdkContext} from "../src/types";

const OWNER = "0xAbCd000000000000000000000000000000000001";
const DESTINATION = "0x0000000000000000000000000000000000000002";

type Call = { method: string; payload: unknown };

const permitTx: UnsignedTx = {
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
};

const ephemeralTx: UnsignedTx = {
  meta: {},
  network: Networks.Polygon,
  nonce: 1,
  phase: "moneriumOnrampSelfTransfer",
  signer: "0xEVM",
  txData: { data: "0x", gas: "21000", to: "0x0000000000000000000000000000000000000003", value: "0" }
};

const rampProcess = (unsignedTxs: UnsignedTx[]): RampProcess => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  currentPhase: "initial",
  from: EPaymentMethod.SEPA,
  id: "ramp_eur",
  inputAmount: "100",
  inputCurrency: FiatToken.EURC,
  outputAmount: "107",
  outputCurrency: "USDC",
  paymentMethod: EPaymentMethod.SEPA,
  quoteId: "quote_eur",
  to: Networks.Arbitrum,
  type: RampDirection.BUY,
  unsignedTxs,
  updatedAt: "2026-01-01T00:00:00.000Z"
});

function setup() {
  const calls: Call[] = [];
  const apiService = new ApiService("http://localhost:3000");
  apiService.registerRamp = async (req: RegisterRampRequest) => {
    calls.push({ method: "registerRamp", payload: req });
    return rampProcess([permitTx, ephemeralTx]);
  };
  apiService.updateRamp = async (req: UpdateRampRequest) => {
    calls.push({ method: "updateRamp", payload: req });
    return { ...rampProcess([permitTx, ephemeralTx]), ibanPaymentData: undefined };
  };
  const context: VortexSdkContext = {
    storeEphemerals: async (...args) => {
      calls.push({ method: "storeEphemerals", payload: args });
    }
  };
  const generateEphemerals = async () => ({
    accountMetas: [
      { address: "5SUBSTRATE", type: EphemeralAccountType.Substrate },
      { address: "0xEVM", type: EphemeralAccountType.EVM }
    ],
    ephemerals: {
      EVM: { address: "0xEVM", secret: "s" },
      Substrate: { address: "5SUBSTRATE", secret: "s" }
    }
  });
  const signTransactions = async (txs: UnsignedTx[]): Promise<PresignedTx[]> => {
    calls.push({ method: "signTransactions", payload: txs });
    return txs.map((t, i) => ({ ...t, txData: `presigned_${i}` }));
  };
  return { calls, handler: new EurHandler(apiService, context, generateEphemerals, signTransactions) };
}

describe("EurHandler onramp", () => {
  test("registers with the linked wallet, signs only ephemeral transactions, then updates", async () => {
    const { calls, handler } = setup();

    const result = await handler.registerEurOnramp("quote_eur", { destinationAddress: DESTINATION, walletAddress: OWNER });

    expect(result.id).toBe("ramp_eur");
    expect(calls.map(c => c.method)).toEqual(["registerRamp", "storeEphemerals", "signTransactions", "updateRamp"]);
    const reg = calls[0].payload as RegisterRampRequest;
    expect(reg.additionalData).toEqual({ destinationAddress: DESTINATION, walletAddress: OWNER });
    const signed = calls[2].payload as UnsignedTx[];
    expect(signed.map(tx => tx.signer)).toEqual(["0xEVM"]);
    const upd = calls[3].payload as UpdateRampRequest;
    expect(upd.presignedTxs).toHaveLength(1);
    expect(upd.additionalData).toEqual({});
  });

  test("passes the selected legal profile to the EUR registration request", async () => {
    const { calls, handler } = setup();

    await handler.registerEurOnramp("quote_eur", {
      customerType: "business",
      destinationAddress: DESTINATION,
      walletAddress: OWNER
    });

    const reg = calls[0].payload as RegisterRampRequest;
    expect(reg.additionalData).toEqual({ customerType: "business", destinationAddress: DESTINATION, walletAddress: OWNER });
  });

  test("rejects registration without the linked wallet before calling the API", async () => {
    const { calls, handler } = setup();
    await expect(handler.registerEurOnramp("quote_eur", { destinationAddress: DESTINATION, walletAddress: "" })).rejects.toBeInstanceOf(
      MissingEurOnrampParametersError
    );
    expect(calls).toHaveLength(0);
  });
});
