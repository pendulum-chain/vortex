import { describe, expect, it } from "bun:test";
import { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import { isForwardTransition, mapOrderStateToDepositStatus, parseOrderEvent } from "./deposit-processor";

const { Held, Minted, Pending, Returned } = MoneriumFiatDepositStatus;

describe("forward-only deposit status transitions", () => {
  it("allows pending to progress to minted, held, or returned", () => {
    expect(isForwardTransition(Pending, Minted)).toBe(true);
    expect(isForwardTransition(Pending, Held)).toBe(true);
    expect(isForwardTransition(Pending, Returned)).toBe(true);
  });

  it("allows a hold to resolve to minted or returned but never back to pending", () => {
    expect(isForwardTransition(Held, Minted)).toBe(true);
    expect(isForwardTransition(Held, Returned)).toBe(true);
    expect(isForwardTransition(Held, Pending)).toBe(false);
  });

  it("treats minted and returned as terminal", () => {
    for (const to of [Pending, Held, Returned]) {
      expect(isForwardTransition(Minted, to)).toBe(false);
    }
    for (const to of [Pending, Held, Minted]) {
      expect(isForwardTransition(Returned, to)).toBe(false);
    }
  });

  it("never allows a self-transition write", () => {
    for (const status of [Pending, Held, Minted, Returned]) {
      expect(isForwardTransition(status, status)).toBe(false);
    }
  });
});

describe("mapOrderStateToDepositStatus", () => {
  it("maps documented Monerium order states", () => {
    expect(mapOrderStateToDepositStatus("placed")).toBe(Pending);
    expect(mapOrderStateToDepositStatus("pending")).toBe(Pending);
    expect(mapOrderStateToDepositStatus("processed")).toBe(Minted);
    expect(mapOrderStateToDepositStatus("rejected")).toBe(Returned);
    expect(mapOrderStateToDepositStatus("held")).toBe(Held);
  });

  it("normalizes case and whitespace, and returns null for unknown states", () => {
    expect(mapOrderStateToDepositStatus(" Processed ")).toBe(Minted);
    expect(mapOrderStateToDepositStatus("something-new")).toBeNull();
    expect(mapOrderStateToDepositStatus("")).toBeNull();
  });
});

describe("parseOrderEvent", () => {
  const validPayload = {
    data: {
      address: "0x1111111111111111111111111111111111111111",
      amount: "100.5",
      currency: "eur",
      id: "order-1",
      kind: "issue",
      meta: { txHash: "0xabc" },
      state: "processed"
    },
    timestamp: "2026-07-17T00:00:00Z",
    type: "order.updated"
  };

  it("extracts the issue-order fields", () => {
    expect(parseOrderEvent(validPayload)).toEqual({
      amount: "100.5",
      currency: "eur",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      orderId: "order-1",
      state: "processed",
      txHash: "0xabc"
    });
  });

  it("ignores redeem orders, non-order events, and malformed payloads", () => {
    expect(parseOrderEvent({ ...validPayload, data: { ...validPayload.data, kind: "redeem" } })).toBeNull();
    expect(parseOrderEvent({ ...validPayload, type: "profile.updated" })).toBeNull();
    expect(parseOrderEvent({ ...validPayload, data: { ...validPayload.data, id: undefined } })).toBeNull();
    expect(parseOrderEvent({ ...validPayload, data: { ...validPayload.data, amount: 100.5 } })).toBeNull();
    expect(parseOrderEvent(null)).toBeNull();
    expect(parseOrderEvent("junk")).toBeNull();
  });
});
