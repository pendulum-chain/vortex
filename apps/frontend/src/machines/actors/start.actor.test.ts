// @vitest-environment jsdom
import { StartRampRequest } from "@vortexfi/shared";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../services/api/api-client";
import { buildQuoteResponse, buildRampProcess } from "../../test/fixtures";
import { API_BASE_URL, server } from "../../test/msw-server";
import { RampContext } from "../types";
import { startRampActor } from "./start.actor";

function buildContext(overrides: Partial<RampContext> = {}): RampContext {
  return {
    rampState: {
      quote: buildQuoteResponse(),
      ramp: buildRampProcess("initial", { id: "ramp-123" }),
      requiredUserActionsCompleted: true,
      signedTransactions: [],
      userSigningMeta: undefined
    },
    ...overrides
  } as RampContext;
}

describe("startRampActor", () => {
  it("starts the ramp and returns the updated process", async () => {
    const startCalls: StartRampRequest[] = [];
    server.use(
      http.post(`${API_BASE_URL}/ramp/start`, async ({ request }) => {
        startCalls.push((await request.json()) as StartRampRequest);
        return HttpResponse.json(buildRampProcess("squidRouterApprove", { id: "ramp-123" }));
      })
    );

    const result = await startRampActor({ input: buildContext() });

    expect(startCalls).toEqual([{ rampId: "ramp-123" }]);
    expect(result.currentPhase).toBe("squidRouterApprove");
  });

  it.each([
    ["rampState", { rampState: undefined }],
    ["ramp process", { rampState: { ramp: undefined } as RampContext["rampState"] }]
  ])("throws when the %s is missing", async (_field, override) => {
    await expect(startRampActor({ input: buildContext(override as Partial<RampContext>) })).rejects.toThrow(
      "Ramp state or ramp process not found."
    );
  });

  it("propagates an API failure", async () => {
    server.use(http.post(`${API_BASE_URL}/ramp/start`, () => HttpResponse.json({ error: "Ramp not ready" }, { status: 400 })));

    const promise = startRampActor({ input: buildContext() });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ message: "Ramp not ready", status: 400 });
  });
});
