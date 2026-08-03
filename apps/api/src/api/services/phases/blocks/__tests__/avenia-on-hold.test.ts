import { beforeEach, describe, expect, it, mock } from "bun:test";
import { syncAveniaOnHoldState } from "../phases/avenia-mint/on-hold";

const getAveniaPayinTickets = mock(async () => [{ id: "ticket-1", status: "ON-HOLD" }]);
const brlaApiService = { getAveniaPayinTickets };

function makeState(initialOnHold?: boolean) {
  return { aveniaTicketId: "ticket-1", onHold: initialOnHold };
}

describe("syncAveniaOnHoldState", () => {
  beforeEach(() => {
    getAveniaPayinTickets.mockClear();
    getAveniaPayinTickets.mockImplementation(async () => [{ id: "ticket-1", status: "ON-HOLD" }]);
  });

  it("marks the ramp as on hold when the Avenia ticket is ON-HOLD", async () => {
    const state = makeState(false);
    const found = await syncAveniaOnHoldState(
      state,
      async nextState => Object.assign(state, nextState),
      brlaApiService,
      "subaccount-1"
    );

    expect(found).toBe(true);
    expect(getAveniaPayinTickets).toHaveBeenCalledWith("subaccount-1");
    expect(state.onHold).toBe(true);
  });

  it("normalizes status casing and clears a stale hold", async () => {
    getAveniaPayinTickets.mockImplementationOnce(async () => [{ id: "ticket-1", status: "paid" }]);
    const state = makeState(true);

    await syncAveniaOnHoldState(state, async nextState => Object.assign(state, nextState), brlaApiService, "subaccount-1");

    expect(state.onHold).toBe(false);
  });

  it("does not update state when the ticket is missing", async () => {
    getAveniaPayinTickets.mockImplementationOnce(async () => []);
    const updateState = mock(async () => undefined);

    expect(await syncAveniaOnHoldState(makeState(false), updateState, brlaApiService, "subaccount-1")).toBe(false);
    expect(updateState).not.toHaveBeenCalled();
  });
});
