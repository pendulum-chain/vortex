import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumWebhookEvent from "../../../models/moneriumWebhookEvent.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import {
  isForwardTransition,
  mapOrderStateToDepositStatus,
  parseIbanEvent,
  parseOrderEvent,
  processMoneriumWebhookInbox
} from "./deposit-processor";

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

describe("parseIbanEvent", () => {
  const validPayload = {
    data: {
      address: "0x1111111111111111111111111111111111111111",
      chain: "ethereum",
      iban: "EE08 7224 5745 6244 9516"
    },
    timestamp: "2026-07-17T00:00:00Z",
    type: "iban.updated"
  };

  it("extracts the IBAN and its linked address", () => {
    expect(parseIbanEvent(validPayload)).toEqual({
      address: "0x1111111111111111111111111111111111111111",
      iban: "EE08 7224 5745 6244 9516"
    });
  });

  it("ignores non-iban events and payloads missing the IBAN or address", () => {
    expect(parseIbanEvent({ ...validPayload, type: "order.updated" })).toBeNull();
    expect(parseIbanEvent({ ...validPayload, data: { ...validPayload.data, iban: "" } })).toBeNull();
    expect(parseIbanEvent({ ...validPayload, data: { ...validPayload.data, address: undefined } })).toBeNull();
    expect(parseIbanEvent(null)).toBeNull();
    expect(parseIbanEvent("junk")).toBeNull();
  });
});

describe("order-event inbox processing (end to end)", () => {
  const FORWARDER = "0x1111111111111111111111111111111111111111";

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function orderEvent(state: string, overrides: Record<string, unknown> = {}) {
    return {
      data: {
        address: FORWARDER,
        amount: "100.5",
        currency: "eur",
        id: "order-1",
        kind: "issue",
        meta: {},
        state,
        ...overrides
      },
      timestamp: "2026-08-26T00:00:00Z",
      type: "order.updated"
    };
  }

  async function createAccount(): Promise<MoneriumAccount> {
    return MoneriumAccount.create({
      destination: "0x2222222222222222222222222222222222222222",
      fallbackAddress: "0x3333333333333333333333333333333333333333",
      feeBps: 0,
      forwarderAddress: FORWARDER,
      profileId: crypto.randomUUID()
    });
  }

  it("creates the deposit, advances it forward-only, and dedups deliveries", async () => {
    const account = await createAccount();

    await MoneriumWebhookEvent.create({ eventId: "evt-1", payload: orderEvent("placed") });
    expect(await processMoneriumWebhookInbox()).toBe(1);

    const created = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: "order-1" } });
    expect(created).toMatchObject({
      accountId: account.id,
      amountRaw: (1005n * 10n ** 17n).toString(),
      status: MoneriumFiatDepositStatus.Pending
    });

    // processed advances to minted and records the mint hash from meta.
    await MoneriumWebhookEvent.create({ eventId: "evt-2", payload: orderEvent("processed", { meta: { txHash: "0xmint" } }) });
    await processMoneriumWebhookInbox();
    await created?.reload();
    expect(created?.status).toBe(MoneriumFiatDepositStatus.Minted);
    expect(created?.txHash).toBe("0xmint");

    // A delayed older state must never regress the row.
    await MoneriumWebhookEvent.create({ eventId: "evt-3", payload: orderEvent("pending") });
    await processMoneriumWebhookInbox();
    await created?.reload();
    expect(created?.status).toBe(MoneriumFiatDepositStatus.Minted);

    // Replayed deliveries of the same order never create a second row.
    await MoneriumWebhookEvent.create({ eventId: "evt-4", payload: orderEvent("processed") });
    await processMoneriumWebhookInbox();
    expect(await MoneriumFiatDeposit.count()).toBe(1);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it("acks order events for unknown forwarders without creating deposits", async () => {
    await MoneriumWebhookEvent.create({ eventId: "evt-5", payload: orderEvent("placed") });
    expect(await processMoneriumWebhookInbox()).toBe(1);
    expect(await MoneriumFiatDeposit.count()).toBe(0);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it("holds and releases a compliance-held order without regressions", async () => {
    await createAccount();
    await MoneriumWebhookEvent.create({ eventId: "evt-6", payload: orderEvent("placed") });
    await MoneriumWebhookEvent.create({ eventId: "evt-7", payload: orderEvent("held") });
    await processMoneriumWebhookInbox();
    const deposit = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: "order-1" } });
    expect(deposit?.status).toBe(MoneriumFiatDepositStatus.Held);

    await MoneriumWebhookEvent.create({ eventId: "evt-8", payload: orderEvent("processed") });
    await processMoneriumWebhookInbox();
    await deposit?.reload();
    expect(deposit?.status).toBe(MoneriumFiatDepositStatus.Minted);
  });
});
