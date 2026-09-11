import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import crypto from "crypto";
// Value copies taken before the mock.module calls below; restored in afterAll because bun
// module mocks are process-wide and would poison later test files.
import * as webhookEventNamespace from "../../../models/moneriumWebhookEvent.model";
import * as depositProcessorNamespace from "./deposit-processor";

const webhookEventReal = { ...webhookEventNamespace };
const depositProcessorReal = { ...depositProcessorNamespace };

const callOrder: string[] = [];
const bulkCreate = mock(async (_rows: unknown, _options: unknown) => {
  callOrder.push("insert");
  return [];
});
const processInbox = mock(async () => 0);

mock.module("../../../models/moneriumWebhookEvent.model", () => ({
  default: { bulkCreate }
}));
mock.module("./deposit-processor", () => ({
  ...depositProcessorReal,
  processMoneriumWebhookInbox: processInbox
}));

let webhook: typeof import("./webhook");
let controller: typeof import("../../controllers/monerium-b2b.controller");
let config: typeof import("../../../config/vars").config;

const SECRET = "test-webhook-secret";

function sign(rawBody: Buffer, secret: string, encoding: "base64" | "hex" = "hex"): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest(encoding);
}

function mockRequest(rawBody: Buffer | undefined, signature: string | undefined): never {
  return {
    header: (name: string) => (name.toLowerCase() === "webhook-signature" ? signature : undefined),
    rawBody
  } as never;
}

function mockResponse(): { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> } {
  const res = {
    json: mock((_value: unknown) => {
      callOrder.push("respond");
      return res;
    }),
    status: mock((_code: number) => res)
  };
  return res;
}

async function flushSetImmediate(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

beforeAll(async () => {
  webhook = await import("./webhook");
  controller = await import("../../controllers/monerium-b2b.controller");
  ({ config } = await import("../../../config/vars"));
});

beforeEach(() => {
  config.moneriumB2b.webhookSecret = SECRET;
  bulkCreate.mockClear();
  processInbox.mockClear();
  callOrder.length = 0;
});

afterAll(() => {
  mock.module("../../../models/moneriumWebhookEvent.model", () => ({ ...webhookEventReal }));
  mock.module("./deposit-processor", () => ({ ...depositProcessorReal }));
  mock.restore();
});

describe("verifyWebhookSignature", () => {
  const body = Buffer.from(JSON.stringify({ data: { id: "order-1" }, type: "order.updated" }), "utf8");

  it("accepts a correct HMAC-SHA256 in hex or base64 encoding", () => {
    expect(webhook.verifyWebhookSignature(body, sign(body, SECRET, "hex"), SECRET)).toBe(true);
    expect(webhook.verifyWebhookSignature(body, sign(body, SECRET, "base64"), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, tampered bytes, missing header, and empty secret", () => {
    expect(webhook.verifyWebhookSignature(body, sign(body, "other-secret"), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(Buffer.concat([body, Buffer.from(" ")]), sign(body, SECRET), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, sign(body, SECRET), "")).toBe(false);
    expect(webhook.verifyWebhookSignature(body, "not-a-mac", SECRET)).toBe(false);
  });
});

describe("deriveEventId", () => {
  it("uses a top-level payload id when present", () => {
    expect(webhook.deriveEventId(Buffer.from("{}"), { id: "evt-1" })).toBe("evt-1");
  });

  it("falls back to a digest of the raw bytes, stable across redeliveries", () => {
    const raw = Buffer.from('{"type":"order.updated"}');
    const first = webhook.deriveEventId(raw, { type: "order.updated" });
    expect(first).toStartWith("sha256:");
    expect(webhook.deriveEventId(Buffer.from(raw), { type: "order.updated" })).toBe(first);
    expect(webhook.deriveEventId(Buffer.from('{"type":"order.created"}'), { type: "order.created" })).not.toBe(first);
  });
});

describe("recordWebhookEvent", () => {
  it("inserts with on-conflict-do-nothing dedup semantics", async () => {
    await webhook.recordWebhookEvent("evt-1", { type: "order.updated" });
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    const [rows, options] = bulkCreate.mock.calls[0] as [unknown, unknown];
    expect(rows).toEqual([{ eventId: "evt-1", payload: { type: "order.updated" } }]);
    expect(options).toEqual({ ignoreDuplicates: true });
  });
});

describe("POST /v1/monerium-b2b/webhook controller", () => {
  const payload = { data: { id: "order-1" }, timestamp: "2026-07-17T00:00:00Z", type: "order.updated" };
  const rawBody = Buffer.from(JSON.stringify(payload), "utf8");

  it("persists the delivery durably before responding 200 and processes async", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, SECRET)), res as never, next as never);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(bulkCreate).toHaveBeenCalledTimes(1);
    // Durable insert strictly precedes the 200 (R06).
    expect(callOrder).toEqual(["insert", "respond"]);

    await flushSetImmediate();
    expect(processInbox).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid signature with 401 and never touches the inbox", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, "wrong-secret")), res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
    expect(bulkCreate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects when the raw body was not captured", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(undefined, sign(rawBody, SECRET)), res as never, next as never);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it("responds 503 when the webhook secret is not configured", async () => {
    config.moneriumB2b.webhookSecret = "";
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, SECRET)), res as never, next as never);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 503 });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it("acks a redelivery with 200 (insert is a dedup no-op)", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, SECRET)), res as never, next as never);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, SECRET)), res as never, next as never);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenNthCalledWith(2, 200);
    // Same event id both times — the unique index makes the second insert a no-op.
    const firstRows = bulkCreate.mock.calls[0]?.[0] as Array<{ eventId: string }>;
    const secondRows = bulkCreate.mock.calls[1]?.[0] as Array<{ eventId: string }>;
    expect(firstRows[0].eventId).toBe(secondRows[0].eventId);
  });
});
