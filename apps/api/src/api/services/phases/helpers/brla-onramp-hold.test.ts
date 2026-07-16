import { beforeEach, describe, expect, it, mock } from "bun:test";
import { syncAveniaOnHoldState } from "./brla-onramp-hold";

const getAveniaPayinTickets = mock(async () => [{ id: "ticket-1", status: "ON-HOLD" }]);

const brlaApiService = {
  getAveniaPayinTickets
};

function makeState(initialOnHold?: boolean) {
  const state: { aveniaTicketId: string; onHold?: boolean } = {
    aveniaTicketId: "ticket-1",
    onHold: initialOnHold
  };
  return {
    state: {
      ...state
    }
  };
}

describe("syncAveniaOnHoldState", () => {
  beforeEach(() => {
    getAveniaPayinTickets.mockClear();
    getAveniaPayinTickets.mockImplementation(async () => [{ id: "ticket-1", status: "ON-HOLD" }]);
  });

  it("marks the ramp as on hold when the Avenia pay-in ticket is ON-HOLD", async () => {
    const state = makeState(false);

    const ticketFound = await syncAveniaOnHoldState(state.state, async nextState => {
      Object.assign(state.state, nextState);
    }, brlaApiService, "subaccount-1");

    expect(ticketFound).toBe(true);
    expect(getAveniaPayinTickets).toHaveBeenCalledWith("subaccount-1");
    expect(state.state.onHold).toBe(true);
  });

  it("normalizes Avenia ticket status casing", async () => {
    getAveniaPayinTickets.mockImplementationOnce(async () => [{ id: "ticket-1", status: "on-hold" }]);
    const state = makeState(false);

    await syncAveniaOnHoldState(state.state, async nextState => {
      Object.assign(state.state, nextState);
    }, brlaApiService, "subaccount-1");

    expect(state.state.onHold).toBe(true);
  });

  it("clears the on-hold flag when the Avenia pay-in ticket is no longer ON-HOLD", async () => {
    getAveniaPayinTickets.mockImplementationOnce(async () => [{ id: "ticket-1", status: "PAID" }]);
    const state = makeState(true);

    await syncAveniaOnHoldState(state.state, async nextState => {
      Object.assign(state.state, nextState);
    }, brlaApiService, "subaccount-1");

    expect(state.state.onHold).toBe(false);
  });

  it("does not update state when the Avenia pay-in ticket is missing", async () => {
    getAveniaPayinTickets.mockImplementationOnce(async () => []);
    const state = makeState(false);
    const updateState = mock(async () => {});

    const ticketFound = await syncAveniaOnHoldState(state.state, updateState, brlaApiService, "subaccount-1");

    expect(ticketFound).toBe(false);
    expect(updateState).not.toHaveBeenCalled();
  });
});
