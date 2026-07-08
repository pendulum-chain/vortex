// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep the real shared package but stub the pieces that would hit chains: the ephemeral
// signing helper and the polkadot ApiManager (none of these tests may open an RPC connection).
vi.mock("@vortexfi/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@vortexfi/shared")>();
  return {
    ...actual,
    ApiManager: {
      getInstance: () => ({
        getApi: vi.fn(async () => {
          throw new Error("getApi must not be called in these tests");
        })
      })
    },
    signUnsignedTransactions: vi.fn()
  };
});

import {
  FiatToken,
  getAddressForFormat,
  Networks,
  RampDirection,
  RegisterRampRequest,
  signUnsignedTransactions,
  UpdateRampRequest
} from "@vortexfi/shared";
import { ApiError } from "../../services/api/api-client";
import { buildQuoteResponse, buildRampProcess, buildUnsignedTx } from "../../test/fixtures";
import { API_BASE_URL, server } from "../../test/msw-server";
import { RampContext } from "../types";
import { registerRampActor } from "./register.actor";
import { buildRegisterRampAdditionalData, RegisterRampError, RegisterRampErrorType } from "./registerAdditionalData";

const baseContext = {
  connectedWalletAddress: "0x1111111111111111111111111111111111111111",
  externalSessionId: "session-1",
  executionInput: {
    fiatToken: FiatToken.EURC,
    network: Networks.Base,
    quote: {
      id: "quote-1",
      rampType: RampDirection.SELL
    },
    sourceOrDestinationAddress: "0x2222222222222222222222222222222222222222"
  },
  paymentData: undefined,
  userEmail: "user@example.com"
} as unknown as RampContext;

describe("buildRegisterRampAdditionalData", () => {
  it("passes email and destination address for Mykobo EUR offramps", () => {
    expect(buildRegisterRampAdditionalData(baseContext, baseContext.connectedWalletAddress as string)).toMatchObject({
      destinationAddress: "0x2222222222222222222222222222222222222222",
      email: "user@example.com",
      sessionId: "session-1",
      walletAddress: "0x1111111111111111111111111111111111111111"
    });
  });

  it("rejects Mykobo EUR offramps without an email", () => {
    expect(() =>
      buildRegisterRampAdditionalData(
        {
          ...baseContext,
          userEmail: undefined
        },
        baseContext.connectedWalletAddress as string
      )
    ).toThrow(new RegisterRampError("User email is required for Mykobo EUR offramp.", RegisterRampErrorType.InvalidInput));
  });
});

const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const EVM_EPHEMERAL_ADDRESS = "0x3333333333333333333333333333333333333333";
// Well-known Alice dev account (ss58 format 42).
const SUBSTRATE_EPHEMERAL_ADDRESS = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

const quote = buildQuoteResponse({ rampType: RampDirection.SELL });

function buildExecutionContext(overrides: Partial<RampContext> = {}): RampContext {
  return {
    ...baseContext,
    chainId: 1,
    executionInput: {
      ...baseContext.executionInput,
      ephemerals: {
        evmEphemeral: { address: EVM_EPHEMERAL_ADDRESS, secret: "0xsecret" },
        substrateEphemeral: { address: SUBSTRATE_EPHEMERAL_ADDRESS, secret: "seed" }
      },
      quote
    },
    quote,
    userId: "user-1",
    ...overrides
  } as RampContext;
}

// Serves POST /ramp/register and /ramp/update, recording the request bodies.
function mockRampEndpoints(unsignedTxs: ReturnType<typeof buildUnsignedTx>[]) {
  const registerCalls: RegisterRampRequest[] = [];
  const updateCalls: UpdateRampRequest[] = [];
  server.use(
    http.post(`${API_BASE_URL}/ramp/register`, async ({ request }) => {
      registerCalls.push((await request.json()) as RegisterRampRequest);
      return HttpResponse.json({ ...buildRampProcess("initial", { id: "ramp-registered" }), unsignedTxs });
    }),
    http.post(`${API_BASE_URL}/ramp/update`, async ({ request }) => {
      updateCalls.push((await request.json()) as UpdateRampRequest);
      return HttpResponse.json(buildRampProcess("initial", { id: "ramp-updated" }));
    })
  );
  return { registerCalls, updateCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registerRampActor", () => {
  it.each([
    ["executionInput", { executionInput: undefined }],
    ["quote", { quote: undefined }],
    ["connectedWalletAddress", { connectedWalletAddress: undefined }],
    ["chainId", { chainId: undefined }]
  ])("throws an InvalidInput error when %s is missing", async (_field, override) => {
    const context = buildExecutionContext(override as Partial<RampContext>);

    await expect(registerRampActor({ input: context })).rejects.toMatchObject({
      type: RegisterRampErrorType.InvalidInput
    });
  });

  it("registers the ramp, signs only the ephemeral transactions and submits them", async () => {
    const userTx = buildUnsignedTx({ signer: USER_ADDRESS.toUpperCase().replace("0X", "0x") });
    const ephemeralTx = buildUnsignedTx({ phase: "squidRouterPay", signer: EVM_EPHEMERAL_ADDRESS });
    const { registerCalls, updateCalls } = mockRampEndpoints([userTx, ephemeralTx]);
    const signedEphemeralTx = { ...ephemeralTx, txData: "0xsigned" };
    vi.mocked(signUnsignedTransactions).mockResolvedValue([signedEphemeralTx]);

    const result = await registerRampActor({ input: buildExecutionContext() });

    expect(registerCalls).toHaveLength(1);
    expect(registerCalls[0]).toMatchObject({
      additionalData: {
        destinationAddress: "0x2222222222222222222222222222222222222222",
        email: "user@example.com",
        sessionId: "session-1",
        walletAddress: USER_ADDRESS
      },
      quoteId: "quote-1",
      signingAccounts: [
        { address: EVM_EPHEMERAL_ADDRESS, type: "EVM" },
        { address: SUBSTRATE_EPHEMERAL_ADDRESS, type: "Substrate" }
      ],
      userId: "user-1"
    });

    // Only the ephemeral tx reaches the signer: the user-signed tx is matched case-insensitively.
    expect(vi.mocked(signUnsignedTransactions).mock.calls[0][0]).toEqual([ephemeralTx]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].rampId).toBe("ramp-registered");
    expect(updateCalls[0].presignedTxs).toEqual([signedEphemeralTx]);

    expect(result).toEqual({
      quote,
      ramp: expect.objectContaining({ id: "ramp-updated" }),
      requiredUserActionsCompleted: false,
      signedTransactions: [signedEphemeralTx],
      userSigningMeta: {
        assethubToPendulumHash: undefined,
        squidRouterApproveHash: undefined,
        squidRouterSwapHash: undefined
      }
    });
  });

  it("excludes the user's substrate transactions across ss58 formats on substrate chains", async () => {
    const userSubstrateTx = buildUnsignedTx({
      network: Networks.Pendulum,
      phase: "assethubToPendulum",
      // Signer encoded with the Polkadot prefix while the wallet uses the generic prefix.
      signer: getAddressForFormat(SUBSTRATE_EPHEMERAL_ADDRESS, 0),
      txData: "0xdeadbeef"
    });
    const ephemeralTx = buildUnsignedTx({ phase: "squidRouterPay", signer: EVM_EPHEMERAL_ADDRESS });
    mockRampEndpoints([userSubstrateTx, ephemeralTx]);
    vi.mocked(signUnsignedTransactions).mockResolvedValue([ephemeralTx]);

    await registerRampActor({
      input: buildExecutionContext({ chainId: -1, connectedWalletAddress: SUBSTRATE_EPHEMERAL_ADDRESS })
    });

    // If the Pendulum tx were not filtered out, the stubbed ApiManager.getApi would throw.
    expect(vi.mocked(signUnsignedTransactions).mock.calls[0][0]).toEqual([ephemeralTx]);
  });

  it("propagates a registration API failure without signing or updating", async () => {
    const { updateCalls } = mockRampEndpoints([]);
    server.use(
      http.post(`${API_BASE_URL}/ramp/register`, () =>
        HttpResponse.json({ error: "Quote expired" }, { status: 400 })
      )
    );

    const promise = registerRampActor({ input: buildExecutionContext() });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: "Quote expired", status: 400 });
    expect(signUnsignedTransactions).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it("propagates an update API failure after registration", async () => {
    const ephemeralTx = buildUnsignedTx({ signer: EVM_EPHEMERAL_ADDRESS });
    mockRampEndpoints([ephemeralTx]);
    server.use(http.post(`${API_BASE_URL}/ramp/update`, () => HttpResponse.json({ error: "boom" }, { status: 500 })));
    vi.mocked(signUnsignedTransactions).mockResolvedValue([ephemeralTx]);

    await expect(registerRampActor({ input: buildExecutionContext() })).rejects.toMatchObject({ status: 500 });
  });
});
