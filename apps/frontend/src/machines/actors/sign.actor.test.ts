// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real module imports wagmi/walletconnect config at module load; the actor tests only
// care about which signing helper is routed to, not the wallet plumbing itself.
vi.mock("../../services/transactions/userSigning", () => ({
  signAndSubmitEvmTransaction: vi.fn(),
  signAndSubmitSubstrateTransaction: vi.fn(),
  signMultipleTypedData: vi.fn()
}));

import { WalletAccount } from "@talismn/connect-wallets";
import { EvmToken, getAddressForFormat, Networks, UnsignedTx, UpdateRampRequest } from "@vortexfi/shared";
import { buildQuoteResponse, buildRampProcess, buildSignedTypedData, buildUnsignedTx } from "../../test/fixtures";
import { API_BASE_URL, server } from "../../test/msw-server";
import {
  signAndSubmitEvmTransaction,
  signAndSubmitSubstrateTransaction,
  signMultipleTypedData
} from "../../services/transactions/userSigning";
import { RampExecutionInput, RampState } from "../../types/phases";
import { RampContext, RampMachineActor } from "../types";
import { SignRampError, SignRampErrorType, signTransactionsActor } from "./sign.actor";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x9999999999999999999999999999999999999999";
// Well-known Alice dev account (ss58 format 42).
const ALICE_SUBSTRATE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

function buildRampState(unsignedTxs: UnsignedTx[]): RampState {
  return {
    quote: buildQuoteResponse(),
    ramp: { ...buildRampProcess("initial"), unsignedTxs },
    requiredUserActionsCompleted: false,
    signedTransactions: [],
    userSigningMeta: undefined
  };
}

function buildContext(unsignedTxs: UnsignedTx[], overrides: Partial<RampContext> = {}): RampContext {
  return {
    chainId: 1,
    connectedWalletAddress: USER_ADDRESS,
    rampState: buildRampState(unsignedTxs),
    ...overrides
  } as RampContext;
}

function buildParent() {
  const events: Array<{ type: string } & Record<string, unknown>> = [];
  const parent = { send: (event: { type: string }) => events.push(event) } as unknown as RampMachineActor;
  return { events, parent };
}

// Serves POST /ramp/update and records the request bodies.
function mockUpdateEndpoint() {
  const calls: UpdateRampRequest[] = [];
  server.use(
    http.post(`${API_BASE_URL}/ramp/update`, async ({ request }) => {
      calls.push((await request.json()) as UpdateRampRequest);
      return HttpResponse.json(buildRampProcess("initial", { id: "ramp-updated" }));
    })
  );
  return calls;
}

async function runActor(context: RampContext) {
  const { events, parent } = buildParent();
  const result = await signTransactionsActor({ input: { context, parent } });
  return { events, result };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signTransactionsActor", () => {
  describe("input validation", () => {
    it.each([
      ["rampState", { rampState: undefined }],
      ["connectedWalletAddress", { connectedWalletAddress: undefined }],
      ["chainId", { chainId: undefined }]
    ])("throws an InvalidInput error when %s is missing", async (_field, override) => {
      const context = buildContext([buildUnsignedTx()], override as Partial<RampContext>);
      const { parent } = buildParent();

      await expect(signTransactionsActor({ input: { context, parent } })).rejects.toMatchObject({
        type: SignRampErrorType.InvalidInput
      });
    });
  });

  describe("transaction filtering", () => {
    it("returns the ramp state untouched when no transaction is signed by the connected wallet", async () => {
      const updateCalls = mockUpdateEndpoint();
      const context = buildContext([buildUnsignedTx({ signer: OTHER_ADDRESS })]);

      const { result } = await runActor(context);

      expect(result).toBe(context.rampState);
      expect(signAndSubmitEvmTransaction).not.toHaveBeenCalled();
      expect(updateCalls).toHaveLength(0);
    });

    it("signs only the user-wallet transactions of a SELL ramp, never the ephemeral's phases", async () => {
      const updateCalls = mockUpdateEndpoint();
      vi.mocked(signAndSubmitEvmTransaction).mockResolvedValue("0xtransferhash");
      // A registered offramp carries both kinds: the user's source-of-funds
      // transfer plus the ephemeral's presign blueprints (which would throw as
      // "unknown phase" if they ever reached the user signing loop).
      const context = buildContext([
        buildUnsignedTx({ nonce: 0, phase: "squidRouterNoPermitTransfer", signer: USER_ADDRESS }),
        buildUnsignedTx({ nonce: 1, phase: "nablaApprove", signer: OTHER_ADDRESS }),
        buildUnsignedTx({ nonce: 2, phase: "nablaSwap", signer: OTHER_ADDRESS }),
        buildUnsignedTx({ nonce: 3, phase: "brlaPayoutOnBase", signer: OTHER_ADDRESS })
      ]);

      const { result } = await runActor(context);

      expect(signAndSubmitEvmTransaction).toHaveBeenCalledTimes(1);
      expect(vi.mocked(signAndSubmitEvmTransaction).mock.calls[0][0].phase).toBe("squidRouterNoPermitTransfer");
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].additionalData).toMatchObject({ squidRouterNoPermitTransferHash: "0xtransferhash" });
      expect(result.userSigningMeta).toBeDefined();
    });

    it("matches EVM signers case-insensitively", async () => {
      mockUpdateEndpoint();
      vi.mocked(signAndSubmitEvmTransaction).mockResolvedValue("0xhash");
      const context = buildContext([buildUnsignedTx({ signer: USER_ADDRESS.toUpperCase().replace("0X", "0x") })]);

      await runActor(context);

      expect(signAndSubmitEvmTransaction).toHaveBeenCalledTimes(1);
    });

    it("matches substrate signers across ss58 formats when on a substrate chain", async () => {
      mockUpdateEndpoint();
      vi.mocked(signAndSubmitSubstrateTransaction).mockResolvedValue("0xsubstratehash");
      const walletAccount = { address: ALICE_SUBSTRATE } as WalletAccount;
      // Signer encoded with the Polkadot ss58 prefix, wallet connected with the generic prefix.
      const context = buildContext(
        [buildUnsignedTx({ network: Networks.AssetHub, phase: "assethubToPendulum", signer: getAddressForFormat(ALICE_SUBSTRATE, 0), txData: "0xdeadbeef" })],
        { chainId: -1, connectedWalletAddress: ALICE_SUBSTRATE, substrateWalletAccount: walletAccount }
      );

      await runActor(context);

      expect(signAndSubmitSubstrateTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("EVM signing", () => {
    it("signs squidRouter transactions in nonce order, reports progress and stores the hashes", async () => {
      const updateCalls = mockUpdateEndpoint();
      vi.mocked(signAndSubmitEvmTransaction).mockResolvedValueOnce("0xapprovehash").mockResolvedValueOnce("0xswaphash");
      const swapTx = buildUnsignedTx({ nonce: 2, phase: "squidRouterSwap" });
      const approveTx = buildUnsignedTx({ nonce: 1, phase: "squidRouterApprove" });
      // Deliberately out of order to prove nonce sorting.
      const context = buildContext([swapTx, approveTx]);

      const { events, result } = await runActor(context);

      expect(vi.mocked(signAndSubmitEvmTransaction).mock.calls.map(call => call[0].phase)).toEqual([
        "squidRouterApprove",
        "squidRouterSwap"
      ]);
      expect(events).toEqual([
        { current: 1, max: 2, phase: "started", type: "SIGNING_UPDATE" },
        { current: 1, max: 2, phase: "signed", type: "SIGNING_UPDATE" },
        { current: 2, max: 2, phase: "finished", type: "SIGNING_UPDATE" }
      ]);
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].additionalData).toMatchObject({
        squidRouterApproveHash: "0xapprovehash",
        squidRouterSwapHash: "0xswaphash"
      });
      expect(result.ramp?.id).toBe("ramp-updated");
      expect(result.userSigningMeta).toEqual({
        assethubToPendulumHash: undefined,
        squidRouterApproveHash: "0xapprovehash",
        squidRouterSwapHash: "0xswaphash"
      });
    });

    it("signs the no-permit squidRouter transaction sequence", async () => {
      const updateCalls = mockUpdateEndpoint();
      vi.mocked(signAndSubmitEvmTransaction)
        .mockResolvedValueOnce("0xtransferhash")
        .mockResolvedValueOnce("0xnopermitapprovehash")
        .mockResolvedValueOnce("0xnopermitswaphash");
      const context = buildContext([
        buildUnsignedTx({ nonce: 1, phase: "squidRouterNoPermitTransfer" }),
        buildUnsignedTx({ nonce: 2, phase: "squidRouterNoPermitApprove" }),
        buildUnsignedTx({ nonce: 3, phase: "squidRouterNoPermitSwap" })
      ]);

      const { events } = await runActor(context);

      expect(signAndSubmitEvmTransaction).toHaveBeenCalledTimes(3);
      expect(events.map(event => event.phase)).toEqual(["started", "finished", "started", "signed", "finished"]);
      expect(updateCalls[0].additionalData).toMatchObject({
        squidRouterNoPermitApproveHash: "0xnopermitapprovehash",
        squidRouterNoPermitSwapHash: "0xnopermitswaphash",
        squidRouterNoPermitTransferHash: "0xtransferhash"
      });
    });

    it("skips the squidRouterApprove step for native token transfers and reports the login phase", async () => {
      const updateCalls = mockUpdateEndpoint();
      const context = buildContext([buildUnsignedTx({ phase: "squidRouterApprove" })], {
        executionInput: { network: Networks.Ethereum, onChainToken: EvmToken.ETH } as RampExecutionInput
      });

      const { events } = await runActor(context);

      expect(signAndSubmitEvmTransaction).not.toHaveBeenCalled();
      expect(events).toEqual([{ current: 1, max: 1, phase: "login", type: "SIGNING_UPDATE" }]);
      expect(updateCalls).toHaveLength(1);
    });
  });

  describe("typed-data signing", () => {
    it("signs a single typed-data payload, replaces the txData and submits it as a presigned tx", async () => {
      const updateCalls = mockUpdateEndpoint();
      const typedData = buildSignedTypedData();
      const signedTypedData = buildSignedTypedData({ signature: { deadline: 1, r: "0x01", s: "0x02", v: 27 } });
      vi.mocked(signMultipleTypedData).mockResolvedValue([signedTypedData]);
      const context = buildContext([buildUnsignedTx({ phase: "squidRouterPermitExecute", txData: typedData })]);

      const { events } = await runActor(context);

      expect(signMultipleTypedData).toHaveBeenCalledWith([typedData]);
      expect(events.map(event => event.phase)).toEqual(["started", "signed"]);
      expect(updateCalls[0].presignedTxs).toHaveLength(1);
      expect(updateCalls[0].presignedTxs[0].txData).toEqual(signedTypedData);
    });

    it("signs a typed-data array payload in one batch", async () => {
      const updateCalls = mockUpdateEndpoint();
      const typedDataArray = [buildSignedTypedData(), buildSignedTypedData({ primaryType: "OrderWitness" })];
      const signedArray = typedDataArray.map(data =>
        buildSignedTypedData({ ...data, signature: { deadline: 1, r: "0x01", s: "0x02", v: 27 } })
      );
      vi.mocked(signMultipleTypedData).mockResolvedValue(signedArray);
      const context = buildContext([buildUnsignedTx({ phase: "squidRouterPermitExecute", txData: typedDataArray })]);

      await runActor(context);

      expect(signMultipleTypedData).toHaveBeenCalledWith(typedDataArray);
      expect(updateCalls[0].presignedTxs[0].txData).toEqual(signedArray);
    });
  });

  describe("substrate signing", () => {
    it("routes assethubToPendulum transactions to the substrate signer with the wallet account", async () => {
      const updateCalls = mockUpdateEndpoint();
      vi.mocked(signAndSubmitSubstrateTransaction).mockResolvedValue("0xassethubhash");
      const walletAccount = { address: ALICE_SUBSTRATE } as WalletAccount;
      const tx = buildUnsignedTx({
        network: Networks.AssetHub,
        phase: "assethubToPendulum",
        signer: ALICE_SUBSTRATE,
        txData: "0xdeadbeef"
      });
      const context = buildContext([tx], {
        chainId: -1,
        connectedWalletAddress: ALICE_SUBSTRATE,
        substrateWalletAccount: walletAccount
      });

      const { events, result } = await runActor(context);

      expect(signAndSubmitSubstrateTransaction).toHaveBeenCalledWith(tx, walletAccount);
      expect(signAndSubmitEvmTransaction).not.toHaveBeenCalled();
      expect(events.map(event => event.phase)).toEqual(["started", "finished"]);
      expect(updateCalls[0].additionalData).toMatchObject({ assethubToPendulumHash: "0xassethubhash" });
      expect(result.userSigningMeta?.assethubToPendulumHash).toBe("0xassethubhash");
    });

    it("fails with an UnknownError when no substrate wallet account is connected", async () => {
      const tx = buildUnsignedTx({
        network: Networks.AssetHub,
        phase: "assethubToPendulum",
        signer: ALICE_SUBSTRATE,
        txData: "0xdeadbeef"
      });
      const context = buildContext([tx], { chainId: -1, connectedWalletAddress: ALICE_SUBSTRATE });
      const { parent } = buildParent();

      await expect(signTransactionsActor({ input: { context, parent } })).rejects.toMatchObject({
        type: SignRampErrorType.UnknownError
      });
      expect(signAndSubmitSubstrateTransaction).not.toHaveBeenCalled();
    });
  });

  describe("error propagation", () => {
    it("maps a wallet rejection to a UserRejected error", async () => {
      vi.mocked(signAndSubmitEvmTransaction).mockRejectedValue(new Error("User rejected the request."));
      const context = buildContext([buildUnsignedTx()]);
      const { parent } = buildParent();

      const promise = signTransactionsActor({ input: { context, parent } });
      await expect(promise).rejects.toBeInstanceOf(SignRampError);
      await expect(promise).rejects.toMatchObject({
        message: "User rejected the signature request.",
        type: SignRampErrorType.UserRejected
      });
    });

    it("maps any other signing failure to an UnknownError", async () => {
      vi.mocked(signAndSubmitEvmTransaction).mockRejectedValue(new Error("insufficient funds for gas"));
      const context = buildContext([buildUnsignedTx()]);
      const { parent } = buildParent();

      await expect(signTransactionsActor({ input: { context, parent } })).rejects.toMatchObject({
        message: "Error signing transaction",
        type: SignRampErrorType.UnknownError
      });
    });

    it("rejects transactions with an unexpected phase", async () => {
      const context = buildContext([buildUnsignedTx({ phase: "nablaSwap" })]);
      const { parent } = buildParent();

      await expect(signTransactionsActor({ input: { context, parent } })).rejects.toMatchObject({
        type: SignRampErrorType.UnknownError
      });
      expect(signAndSubmitEvmTransaction).not.toHaveBeenCalled();
    });
  });
});
