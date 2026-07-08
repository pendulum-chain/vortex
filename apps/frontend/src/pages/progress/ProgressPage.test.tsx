// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { RampPhase } from "@vortexfi/shared";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeRampActor, FakeRampActor } from "../../test/fakeRampActor";
import { buildQuoteResponse, buildRampProcess } from "../../test/fixtures";
import "../../test/i18n";
import { API_BASE_URL, server } from "../../test/msw-server";
import { RampState } from "../../types/phases";

// Module-level singletons: hooks that appear in effect dependency arrays must return
// stable references (see Onramp.test.tsx).
const stubs = {
  events: { trackEvent: vi.fn() },
  network: {
    networkSelectorDisabled: false,
    selectedNetwork: "base",
    setNetworkSelectorDisabled: vi.fn(),
    setSelectedNetwork: vi.fn()
  }
};

let fakeRampActor: FakeRampActor;
vi.mock("../../contexts/rampState", () => ({
  useRampActor: () => fakeRampActor
}));

vi.mock("../../contexts/network", () => ({
  useNetwork: () => stubs.network
}));

vi.mock("../../contexts/events", () => ({
  useEventsContext: () => stubs.events
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>
}));

import { ProgressPage } from "./index";

// A BRL onramp (BUY, inputCurrency BRL) — flow "onramp_brl" on the progress page.
function buildRampState(currentPhase: RampPhase, rampOverrides: Record<string, unknown> = {}): RampState {
  return {
    quote: buildQuoteResponse(),
    ramp: buildRampProcess(currentPhase, rampOverrides),
    requiredUserActionsCompleted: true,
    signedTransactions: [],
    userSigningMeta: undefined
  };
}

// Serves GET /ramp/:id and records how often it was polled.
function mockRampStatusEndpoint(response: () => ReturnType<typeof HttpResponse.json>) {
  const calls: string[] = [];
  server.use(
    http.get(`${API_BASE_URL}/ramp/:id`, ({ params }) => {
      calls.push(params.id as string);
      return response();
    })
  );
  return calls;
}

describe("ProgressPage", () => {
  beforeEach(() => {
    localStorage.clear();
    stubs.events.trackEvent.mockClear();
  });

  it.each([
    ["brlaOnrampMint" as RampPhase, "Your payment is being processed. This can take up to 5 minutes."],
    ["nablaSwap" as RampPhase, "Swapping to USDC on Vortex DEX"]
  ])("renders the message for the current phase (%s)", async (phase, expectedMessage) => {
    fakeRampActor = createFakeRampActor(buildRampState(phase));
    mockRampStatusEndpoint(() => HttpResponse.json(buildRampProcess(phase)));

    render(<ProgressPage />);

    expect(screen.getByText("Your transaction is in progress.")).toBeInTheDocument();
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it("advances the displayed phase when polling returns a later phase", async () => {
    fakeRampActor = createFakeRampActor(buildRampState("brlaOnrampMint"));
    mockRampStatusEndpoint(() => HttpResponse.json(buildRampProcess("nablaSwap")));

    render(<ProgressPage />);

    expect(await screen.findByText("Swapping to USDC on Vortex DEX")).toBeInTheDocument();
    expect(stubs.events.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "progress", phase_name: "nablaSwap" }));
  });

  it("drops a poll response whose ramp id does not match the active ramp", async () => {
    fakeRampActor = createFakeRampActor(buildRampState("brlaOnrampMint"));
    const calls = mockRampStatusEndpoint(() => HttpResponse.json(buildRampProcess("nablaSwap", { id: "some-other-ramp" })));

    render(<ProgressPage />);

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(fakeRampActor.events.filter(e => e.type === "SET_RAMP_STATE")).toHaveLength(0);
    expect(screen.getByText("Your payment is being processed. This can take up to 5 minutes.")).toBeInTheDocument();
  });

  it("keeps rendering the current phase when the status poll fails", async () => {
    fakeRampActor = createFakeRampActor(buildRampState("brlaOnrampMint"));
    const calls = mockRampStatusEndpoint(() => HttpResponse.json({ error: "boom" }, { status: 500 }));

    render(<ProgressPage />);

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    expect(fakeRampActor.events.filter(e => e.type === "SET_RAMP_STATE")).toHaveLength(0);
    expect(screen.getByText("Your payment is being processed. This can take up to 5 minutes.")).toBeInTheDocument();
  });

  it("shows the delayed-transaction banner with the ramp id once a ramp is older than 20 minutes", async () => {
    const twentyFiveMinutesAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    fakeRampActor = createFakeRampActor(buildRampState("brlaOnrampMint", { createdAt: twentyFiveMinutesAgo }));
    mockRampStatusEndpoint(() => HttpResponse.json(buildRampProcess("brlaOnrampMint", { createdAt: twentyFiveMinutesAgo })));

    render(<ProgressPage />);

    expect(await screen.findByText("Transaction Status")).toBeInTheDocument();
    expect(screen.getByText("ramp-123")).toBeInTheDocument();
  });

  it("does not show the delayed-transaction banner for a fresh ramp", () => {
    fakeRampActor = createFakeRampActor(buildRampState("brlaOnrampMint"));
    mockRampStatusEndpoint(() => HttpResponse.json(buildRampProcess("brlaOnrampMint")));

    render(<ProgressPage />);

    expect(screen.queryByText("Transaction Status")).not.toBeInTheDocument();
  });
});
