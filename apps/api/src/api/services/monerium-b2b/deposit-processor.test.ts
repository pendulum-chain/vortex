import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
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

const { Converting, Forwarded, Held, Minted, Pending, Recovering, RecoveryFailed, Refunded, Returned } =
  MoneriumFiatDepositStatus;
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PROCESSOR_DEPS = { getChainId: async () => 11155111 };

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

  it("lets a minted deposit convert or enter the refund path, never regress", () => {
    expect(isForwardTransition(Minted, Converting)).toBe(true);
    expect(isForwardTransition(Minted, Recovering)).toBe(true);
    for (const to of [Pending, Held, Returned, Forwarded, Refunded]) {
      expect(isForwardTransition(Minted, to)).toBe(false);
    }
  });

  it("settles a converting deposit by forward or by recovery", () => {
    expect(isForwardTransition(Converting, Forwarded)).toBe(true);
    expect(isForwardTransition(Converting, Recovering)).toBe(true);
    expect(isForwardTransition(Converting, Minted)).toBe(false);
    expect(isForwardTransition(Recovering, Refunded)).toBe(true);
    expect(isForwardTransition(Recovering, RecoveryFailed)).toBe(true);
    expect(isForwardTransition(RecoveryFailed, Recovering)).toBe(true); // operator retry
    expect(isForwardTransition(Recovering, Forwarded)).toBe(false);
  });

  it("treats forwarded, returned and refunded as terminal", () => {
    for (const terminal of [Forwarded, Returned, Refunded]) {
      for (const to of Object.values(MoneriumFiatDepositStatus)) {
        expect(isForwardTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("never allows a self-transition write", () => {
    for (const status of Object.values(MoneriumFiatDepositStatus)) {
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
      chain: "sepolia",
      counterpart: {
        identifier: {
          address: "0x1111111111111111111111111111111111111111",
          chain: "sepolia",
          standard: "chain"
        }
      },
      currency: "eur",
      id: ORDER_ID,
      kind: "issue",
      memo: "",
      meta: { placedAt: "2026-07-17T00:00:00Z", txHashes: ["0xabc"] },
      profile: PROFILE_ID,
      state: "processed"
    },
    timestamp: "2026-07-17T00:00:00Z",
    type: "order.updated"
  };

  it("extracts the issue-order fields", () => {
    expect(parseOrderEvent(validPayload)).toEqual({
      amount: "100.5",
      chain: "sepolia",
      currency: "eur",
      forwarderAddress: "0x1111111111111111111111111111111111111111",
      orderId: ORDER_ID,
      profileId: PROFILE_ID,
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
      iban: "EE08 7224 5745 6244 9516",
      profile: PROFILE_ID
    },
    timestamp: "2026-07-17T00:00:00Z",
    type: "iban.updated"
  };

  it("extracts the IBAN and its linked address", () => {
    expect(parseIbanEvent(validPayload)).toEqual({
      address: "0x1111111111111111111111111111111111111111",
      chain: "ethereum",
      iban: "EE08 7224 5745 6244 9516",
      profileId: PROFILE_ID
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
        chain: "sepolia",
        counterpart: {
          identifier: { address: FORWARDER, chain: "sepolia", standard: "chain" }
        },
        currency: "eur",
        id: ORDER_ID,
        kind: "issue",
        memo: "",
        meta: { placedAt: "2026-08-26T00:00:00Z" },
        profile: PROFILE_ID,
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
      forwarderAddress: FORWARDER,
      profileId: PROFILE_ID
    });
  }

  it("creates the deposit, advances it forward-only, and dedups deliveries", async () => {
    const account = await createAccount();

    await MoneriumWebhookEvent.create({ eventId: "evt-1", payload: orderEvent("placed") });
    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(1);

    const created = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: ORDER_ID } });
    expect(created).toMatchObject({
      accountId: account.id,
      amountRaw: (1005n * 10n ** 17n).toString(),
      status: MoneriumFiatDepositStatus.Pending
    });

    // processed advances to minted and records the mint hash from meta.
    await MoneriumWebhookEvent.create({
      eventId: "evt-2",
      payload: orderEvent("processed", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xmint"] } })
    });
    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    await created?.reload();
    expect(created?.status).toBe(MoneriumFiatDepositStatus.Minted);
    expect(created?.txHash).toBe("0xmint");

    // A delayed older state must never regress the row.
    await MoneriumWebhookEvent.create({ eventId: "evt-3", payload: orderEvent("pending") });
    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    await created?.reload();
    expect(created?.status).toBe(MoneriumFiatDepositStatus.Minted);

    // Replayed deliveries of the same order never create a second row.
    await MoneriumWebhookEvent.create({ eventId: "evt-4", payload: orderEvent("processed") });
    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    expect(await MoneriumFiatDeposit.count()).toBe(1);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);

    await MoneriumWebhookEvent.create({ eventId: "evt-divergent-amount", payload: orderEvent("processed", { amount: "101" }) });
    await MoneriumWebhookEvent.create({
      eventId: "evt-divergent-hash",
      payload: orderEvent("processed", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xother"] } })
    });
    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    await created?.reload();
    expect(created?.amountRaw).toBe((1005n * 10n ** 17n).toString());
    expect(created?.txHash).toBe("0xmint");
  });

  it("acks order events for unknown forwarders without creating deposits", async () => {
    await MoneriumWebhookEvent.create({ eventId: "evt-5", payload: orderEvent("placed") });
    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(1);
    expect(await MoneriumFiatDeposit.count()).toBe(0);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it("adopts an unattributed mint when its matching order webhook arrives late", async () => {
    const account = await createAccount();
    const execution = await MoneriumConversionExecution.create({
      accountId: account.id,
      blockNumber: 101,
      destination: account.destination,
      eureInRaw: (1005n * 10n ** 17n).toString(),
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: 4,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    const unattributed = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw: (1005n * 10n ** 17n).toString(),
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 3,
      moneriumOrderId: "unattr:late-order",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    await execution.update({ depositId: unattributed.id });
    await MoneriumWebhookEvent.create({
      eventId: "evt-late-order",
      payload: orderEvent("processed", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xmint"] } })
    });

    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(1);
    expect(await MoneriumFiatDeposit.count()).toBe(1);
    await unattributed.reload();
    await execution.reload();
    expect(unattributed).toMatchObject({
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      logIndex: 3,
      moneriumOrderId: ORDER_ID,
      txHash: "0xmint"
    });
    expect(execution.depositId).toBe(unattributed.id);
  });

  it("merges an unattributed mint when a tx hash resolves equal-amount order ambiguity", async () => {
    const account = await createAccount();
    const otherOrderId = "33333333-3333-4333-8333-333333333333";
    await MoneriumWebhookEvent.bulkCreate([
      { eventId: "evt-ambiguous-order-a", payload: orderEvent("pending") },
      { eventId: "evt-ambiguous-order-b", payload: orderEvent("pending", { id: otherOrderId }) }
    ]);
    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    const providerDeposit = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: ORDER_ID } });
    const otherDeposit = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: otherOrderId } });
    expect(providerDeposit).not.toBeNull();
    expect(otherDeposit).not.toBeNull();
    if (!providerDeposit || !otherDeposit) throw new Error("expected both provider deposits");

    const execution = await MoneriumConversionExecution.create({
      accountId: account.id,
      blockNumber: 101,
      destination: account.destination,
      eureInRaw: (1005n * 10n ** 17n).toString(),
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: 4,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    const unattributed = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw: (1005n * 10n ** 17n).toString(),
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 3,
      moneriumOrderId: "unattr:ambiguous-order",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    await execution.update({ depositId: unattributed.id });
    await MoneriumWebhookEvent.create({
      eventId: "evt-ambiguous-order-resolved",
      payload: orderEvent("processed", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xmint"] } })
    });

    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    await providerDeposit.reload();
    await otherDeposit.reload();
    await execution.reload();
    expect(await MoneriumFiatDeposit.count()).toBe(2);
    expect(providerDeposit).toMatchObject({
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      logIndex: 3,
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    expect(otherDeposit).toMatchObject({ blockNumber: null, status: MoneriumFiatDepositStatus.Pending, txHash: null });
    expect(execution.depositId).toBe(providerDeposit.id);
  });

  it("never merges a quarantined mint into a terminal returned order", async () => {
    const account = await createAccount();
    const amountRaw = (1005n * 10n ** 17n).toString();
    const providerDeposit = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw,
      currency: "eur",
      moneriumOrderId: ORDER_ID,
      status: MoneriumFiatDepositStatus.Returned
    });
    const unattributed = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw,
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 3,
      moneriumOrderId: "unattr:returned-order",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    const execution = await MoneriumConversionExecution.create({
      accountId: account.id,
      blockNumber: 101,
      destination: account.destination,
      eureInRaw: amountRaw,
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: 4,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    await execution.update({ depositId: unattributed.id });
    await MoneriumWebhookEvent.create({
      eventId: "evt-returned-order-mint",
      payload: orderEvent("processed", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xmint"] } })
    });

    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    await providerDeposit.reload();
    await unattributed.reload();
    await execution.reload();
    expect(providerDeposit).toMatchObject({
      blockHash: null,
      blockNumber: null,
      chainId: null,
      logIndex: null,
      status: MoneriumFiatDepositStatus.Returned,
      txHash: null
    });
    expect(unattributed.txHash).toBe("0xmint");
    expect(execution.depositId).toBe(unattributed.id);
  });

  it("does not adopt an unattributed mint for a first-seen returned order", async () => {
    const account = await createAccount();
    const amountRaw = (1005n * 10n ** 17n).toString();
    const unattributed = await MoneriumFiatDeposit.create({
      accountId: account.id,
      amountRaw,
      blockHash: "0xblock",
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 3,
      moneriumOrderId: "unattr:first-seen-returned",
      status: MoneriumFiatDepositStatus.Minted,
      txHash: "0xmint"
    });
    const execution = await MoneriumConversionExecution.create({
      accountId: account.id,
      blockNumber: 101,
      destination: account.destination,
      eureInRaw: amountRaw,
      status: MoneriumConversionExecutionStatus.Confirmed,
      swapLogIndex: 4,
      txHash: "0xswap",
      usdcNetRaw: "108000000"
    });
    await execution.update({ depositId: unattributed.id });
    await MoneriumWebhookEvent.create({
      eventId: "evt-first-seen-returned",
      payload: orderEvent("rejected", { meta: { placedAt: "2026-08-26T00:00:00Z", txHashes: ["0xmint"] } })
    });

    await processMoneriumWebhookInbox(PROCESSOR_DEPS);
    const providerDeposit = await MoneriumFiatDeposit.findOne({ where: { moneriumOrderId: ORDER_ID } });
    await unattributed.reload();
    await execution.reload();
    expect(await MoneriumFiatDeposit.count()).toBe(2);
    expect(providerDeposit).toMatchObject({
      blockNumber: null,
      status: MoneriumFiatDepositStatus.Returned,
      txHash: "0xmint"
    });
    expect(unattributed.moneriumOrderId).toBe("unattr:first-seen-returned");
    expect(execution.depositId).toBe(unattributed.id);
  });

  it("discards wrong-currency, wrong-chain, and foreign-profile orders", async () => {
    await createAccount();
    const cases = [
      { currency: "usd", id: "33333333-3333-4333-8333-333333333333" },
      { chain: "ethereum", id: "44444444-4444-4444-8444-444444444444" },
      { id: "55555555-5555-4555-8555-555555555555", profile: "66666666-6666-4666-8666-666666666666" }
    ];
    for (const [index, overrides] of cases.entries()) {
      await MoneriumWebhookEvent.create({ eventId: `evt-scope-${index}`, payload: orderEvent("placed", overrides) });
    }

    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(cases.length);
    expect(await MoneriumFiatDeposit.count()).toBe(0);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it("terminally discards malformed amounts without delaying later orders", async () => {
    await createAccount();
    await MoneriumWebhookEvent.create({
      eventId: "evt-invalid-amount",
      payload: orderEvent("placed", {
        amount: "1.0000000000000000001",
        id: "77777777-7777-4777-8777-777777777777"
      })
    });
    await MoneriumWebhookEvent.create({ eventId: "evt-valid-after-invalid", payload: orderEvent("placed") });

    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(2);
    expect(await MoneriumFiatDeposit.count()).toBe(1);
    expect(await MoneriumWebhookEvent.count({ where: { processedAt: null } })).toBe(0);
    expect(await processMoneriumWebhookInbox(PROCESSOR_DEPS)).toBe(0);
  });
});
