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

const SECRET = `whsec_${Buffer.from("01234567890123456789012345678901", "utf8").toString("base64")}`;
const WEBHOOK_ID = "msg_2LhLhM4Q6YwqZ1fX";
const WEBHOOK_TIMESTAMP = "1789142400";

function sign(
  rawBody: Buffer,
  secret = SECRET,
  webhookId = WEBHOOK_ID,
  webhookTimestamp = WEBHOOK_TIMESTAMP
): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  const signedPayload = Buffer.concat([Buffer.from(`${webhookId}.${webhookTimestamp}.`, "utf8"), rawBody]);
  return `v1,${crypto.createHmac("sha256", key).update(signedPayload).digest("base64")}`;
}

function mockRequest(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  webhookId: string | undefined = WEBHOOK_ID,
  webhookTimestamp: string | undefined = WEBHOOK_TIMESTAMP
): never {
  return {
    header: (name: string) => {
      if (name.toLowerCase() === "webhook-id") return webhookId;
      if (name.toLowerCase() === "webhook-timestamp") return webhookTimestamp;
      if (name.toLowerCase() === "webhook-signature") return signature;
      return undefined;
    },
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

  it("accepts the documented Monerium v1 signature", () => {
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body), SECRET)).toBe(true);
  });

  it("rejects tampered signed components and malformed credentials", () => {
    const otherSecret = `whsec_${Buffer.from("other-secret", "utf8").toString("base64")}`;
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body, otherSecret), SECRET)).toBe(false);
    expect(
      webhook.verifyWebhookSignature(Buffer.concat([body, Buffer.from(" ")]), WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body), SECRET)
    ).toBe(false);
    expect(webhook.verifyWebhookSignature(body, `${WEBHOOK_ID}-tampered`, WEBHOOK_TIMESTAMP, sign(body), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, `${WEBHOOK_TIMESTAMP}1`, sign(body), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, undefined, WEBHOOK_TIMESTAMP, sign(body), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, undefined, sign(body), SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, undefined, SECRET)).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body), "test-webhook-secret")).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body), "whsec_not-base64")).toBe(false);
    expect(webhook.verifyWebhookSignature(body, WEBHOOK_ID, WEBHOOK_TIMESTAMP, sign(body).replace("v1,", "v2,"), SECRET)).toBe(
      false
    );
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
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody)), res as never, next as never);

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
    const wrongSecret = `whsec_${Buffer.from("wrong-secret", "utf8").toString("base64")}`;
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody, wrongSecret)), res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
    expect(bulkCreate).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects when the raw body was not captured", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(undefined, sign(rawBody)), res as never, next as never);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it("responds 503 when the webhook secret is not configured", async () => {
    config.moneriumB2b.webhookSecret = "";
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody)), res as never, next as never);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 503 });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it("acks a redelivery with 200 (insert is a dedup no-op)", async () => {
    const res = mockResponse();
    const next = mock((_error: unknown) => undefined);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody)), res as never, next as never);
    await controller.handleWebhook(mockRequest(rawBody, sign(rawBody)), res as never, next as never);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenNthCalledWith(2, 200);
    // Same event id both times — the unique index makes the second insert a no-op.
    const firstRows = bulkCreate.mock.calls[0]?.[0] as Array<{ eventId: string }>;
    const secondRows = bulkCreate.mock.calls[1]?.[0] as Array<{ eventId: string }>;
    expect(firstRows[0].eventId).toBe(WEBHOOK_ID);
    expect(secondRows[0].eventId).toBe(WEBHOOK_ID);
    await flushSetImmediate();
  });
});
