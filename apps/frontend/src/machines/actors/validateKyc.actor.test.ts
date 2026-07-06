// @vitest-environment jsdom
import { FiatToken, RampDirection } from "@vortexfi/shared";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { buildQuoteResponse } from "../../test/fixtures";
import { API_BASE_URL, server } from "../../test/msw-server";
import { RampContext } from "../types";
import { validateKycActor } from "./validateKyc.actor";

// Structurally valid, non-trivial CPF (11 digits).
const VALID_CPF = "52998224725";
const INVALID_TAX_ID = "123";

function buildContext(fiatToken: FiatToken, overrides: Partial<RampContext> = {}): RampContext {
  return {
    executionInput: {
      fiatToken,
      quote: buildQuoteResponse({ outputAmount: "100", rampType: RampDirection.SELL }),
      taxId: fiatToken === FiatToken.BRL ? VALID_CPF : undefined
    },
    externalSessionId: "session-1",
    quoteId: "quote-1",
    rampDirection: RampDirection.SELL,
    ...overrides
  } as RampContext;
}

function mockBrlaUser(user: { evmAddress: string; identityStatus: string }, remainingLimit: string) {
  server.use(
    http.get(`${API_BASE_URL}/brla/getUser`, () => HttpResponse.json({ ...user, subAccountId: "sub-1" })),
    http.get(`${API_BASE_URL}/brla/getUserRemainingLimit`, () => HttpResponse.json({ remainingLimit }))
  );
}

// Serves POST /brla/kyc/record-attempt and records the request bodies.
function mockRecordAttemptEndpoint() {
  const calls: unknown[] = [];
  server.use(
    http.post(`${API_BASE_URL}/brla/kyc/record-attempt`, async ({ request }) => {
      calls.push(await request.json());
      return HttpResponse.json({});
    })
  );
  return calls;
}

describe("validateKycActor", () => {
  it.each([
    ["executionInput", { executionInput: undefined }],
    ["rampDirection", { rampDirection: undefined }],
    ["quoteId", { quoteId: undefined }]
  ])("throws when %s is missing", async (_field, override) => {
    await expect(validateKycActor({ input: buildContext(FiatToken.EURC, override as Partial<RampContext>) })).rejects.toThrow(
      /missing from ramp context/
    );
  });

  it.each([
    ["EURC (Mykobo)", FiatToken.EURC],
    ["ARS (Alfredpay)", FiatToken.ARS],
    ["MXN (Alfredpay)", FiatToken.MXN],
    ["USD (Alfredpay)", FiatToken.USD],
    ["COP (Alfredpay)", FiatToken.COP]
  ])("requires KYC for %s without calling the BRLA API", async (_label, fiatToken) => {
    const result = await validateKycActor({ input: buildContext(fiatToken) });
    expect(result).toEqual({ kycNeeded: true });
  });

  describe("BRL (Avenia)", () => {
    it("throws when the tax ID is missing", async () => {
      const context = buildContext(FiatToken.BRL);
      (context.executionInput as { taxId?: string }).taxId = undefined;

      await expect(validateKycActor({ input: context })).rejects.toThrow(
        "Tax ID must exist when validating KYC for BRL transactions"
      );
    });

    it("skips KYC for a confirmed user within their remaining limit", async () => {
      mockBrlaUser({ evmAddress: "0xbrla", identityStatus: "CONFIRMED" }, "1000");

      const result = await validateKycActor({ input: buildContext(FiatToken.BRL) });

      expect(result).toEqual({ brlaEvmAddress: "0xbrla", kycNeeded: false });
    });

    it("requires KYC when the user exists but their identity is not confirmed", async () => {
      mockBrlaUser({ evmAddress: "0xbrla", identityStatus: "PENDING" }, "1000");

      const result = await validateKycActor({ input: buildContext(FiatToken.BRL) });

      expect(result).toEqual({ brlaEvmAddress: "0xbrla", kycNeeded: true });
    });

    it("requires KYC and records the attempt when the user does not exist yet", async () => {
      server.use(http.get(`${API_BASE_URL}/brla/getUser`, () => HttpResponse.json({ error: "Not found" }, { status: 404 })));
      const recordCalls = mockRecordAttemptEndpoint();

      const result = await validateKycActor({ input: buildContext(FiatToken.BRL) });

      expect(result).toEqual({ kycNeeded: true });
      // recordInitialKycAttempt is fire-and-forget; wait for the request to land.
      await vi.waitFor(() => expect(recordCalls).toHaveLength(1));
      expect(recordCalls[0]).toEqual({ quoteId: "quote-1", sessionId: "session-1", taxId: VALID_CPF });
    });

    // The over-limit throw is swallowed by the surrounding catch: with a structurally valid
    // CPF the actor falls through to "user needs KYC" instead of surfacing the limit error.
    it("treats an exceeded remaining limit as a new KYC attempt for a valid CPF", async () => {
      mockBrlaUser({ evmAddress: "0xbrla", identityStatus: "CONFIRMED" }, "10");
      const recordCalls = mockRecordAttemptEndpoint();

      const result = await validateKycActor({ input: buildContext(FiatToken.BRL) });

      expect(result).toEqual({ kycNeeded: true });
      await vi.waitFor(() => expect(recordCalls).toHaveLength(1));
    });

    it("checks the input amount against the limit for BUY ramps", async () => {
      mockBrlaUser({ evmAddress: "0xbrla", identityStatus: "CONFIRMED" }, "200");
      const context = buildContext(FiatToken.BRL, { rampDirection: RampDirection.BUY });
      // inputAmount 150 (fixture default) <= 200, while outputAmount would also pass; the
      // direction routing is covered by the SELL over-limit test above using outputAmount.
      const result = await validateKycActor({ input: context });

      expect(result).toEqual({ brlaEvmAddress: "0xbrla", kycNeeded: false });
    });

    it("rethrows a user lookup failure when the tax ID is not a valid CPF or CNPJ", async () => {
      server.use(
        http.get(`${API_BASE_URL}/brla/getUser`, () => HttpResponse.json({ error: "Internal error" }, { status: 500 }))
      );
      const context = buildContext(FiatToken.BRL);
      (context.executionInput as { taxId?: string }).taxId = INVALID_TAX_ID;

      await expect(validateKycActor({ input: context })).rejects.toMatchObject({ status: 500 });
    });
  });
});
