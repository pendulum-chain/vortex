// @vitest-environment jsdom
import { TransactionStatus } from "@vortexfi/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRampNavigation } from "./useRampNavigation";

const mocks = vi.hoisted(() => ({
  isQuoteDisplayed: false,
  rampMachineValue: "Idle" as string,
  rampState: undefined as { ramp?: { currentPhase?: string; id?: string; status?: string } } | undefined
}));

vi.mock("./useRampComponentState", () => ({
  useRampComponentState: () => ({
    rampMachineState: { value: mocks.rampMachineValue },
    rampState: mocks.rampState,
    searchParams: {}
  })
}));

vi.mock("./useIsQuoteComponentDisplayed", () => ({
  useIsQuoteComponentDisplayed: () => mocks.isQuoteDisplayed
}));

const render = () => renderHook(() => useRampNavigation("success", "failure", "progress", "form", "quote"));
const current = () => render().result.current.getCurrentComponent();

describe("useRampNavigation", () => {
  beforeEach(() => {
    mocks.isQuoteDisplayed = false;
    mocks.rampMachineValue = "Idle";
    mocks.rampState = undefined;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it("shows the form by default", () => {
    expect(current()).toBe("form");
  });

  it("shows the quote when the quote component is displayed", () => {
    mocks.isQuoteDisplayed = true;
    expect(current()).toBe("quote");
  });

  it("shows progress once a ramp exists and the machine is in RampFollowUp", () => {
    mocks.rampState = { ramp: { currentPhase: "squidRouterSwap" } };
    mocks.rampMachineValue = "RampFollowUp";
    expect(current()).toBe("progress");
  });

  it("does not show progress in RampFollowUp without a ramp state", () => {
    mocks.rampMachineValue = "RampFollowUp";
    mocks.isQuoteDisplayed = true;
    expect(current()).toBe("quote");
  });

  it("shows success for a COMPLETE status or the complete phase, ahead of progress", () => {
    mocks.rampMachineValue = "RampFollowUp";
    mocks.rampState = { ramp: { status: TransactionStatus.COMPLETE } };
    expect(current()).toBe("success");
    mocks.rampState = { ramp: { currentPhase: "complete" } };
    expect(current()).toBe("success");
  });

  it("shows failure for a FAILED status or the failed phase, ahead of the quote", () => {
    mocks.isQuoteDisplayed = true;
    mocks.rampState = { ramp: { status: TransactionStatus.FAILED } };
    expect(current()).toBe("failure");
    mocks.rampState = { ramp: { currentPhase: "failed" } };
    expect(current()).toBe("failure");
  });

  it("exposes the current phase and ramp id", () => {
    mocks.rampState = { ramp: { currentPhase: "squidRouterSwap", id: "ramp-1" } };
    const { currentPhase, transactionId } = render().result.current;
    expect(currentPhase).toBe("squidRouterSwap");
    expect(transactionId).toBe("ramp-1");
  });

  it("scrolls to the top for progress, success and failure only", () => {
    render();
    expect(window.scrollTo).not.toHaveBeenCalled();

    mocks.isQuoteDisplayed = true;
    render();
    expect(window.scrollTo).not.toHaveBeenCalled();

    mocks.rampState = { ramp: { currentPhase: "complete" } };
    render();
    expect(window.scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 0 });
  });
});
