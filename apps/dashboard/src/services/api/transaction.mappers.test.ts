import { TransactionStatus as WireTransactionStatus } from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPhaseToStatus } from "./ramp.service";
import { mapTransactionStatus } from "./transaction.mappers";

describe("mapTransactionStatus", () => {
  it("maps failed ramps to failed", () => {
    assert.equal(mapTransactionStatus({ currentPhase: "failed", status: WireTransactionStatus.FAILED }), "failed");
  });

  it("maps timed-out ramps to cancelled", () => {
    assert.equal(mapTransactionStatus({ currentPhase: "timedOut", status: WireTransactionStatus.FAILED }), "cancelled");
    assert.equal(mapPhaseToStatus("timedOut"), "cancelled");
  });
});
