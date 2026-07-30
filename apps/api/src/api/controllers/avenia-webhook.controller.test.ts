import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import bodyParser from "body-parser";
import express from "express";
import {
  keyServer,
  loggerModuleMock,
  primaryKeys,
  rotatedKeys,
  sharedModuleMock,
  sign
} from "../services/avenia/__tests__/fixtures";

interface AveniaOwner {
  accountType: string;
  profileId: string;
}

const enqueueVerificationNotification = mock(async (_attempt: { id: string }, _userId: string): Promise<boolean> => true);
const findAveniaOwnerBySubaccountId = mock(
  async (): Promise<AveniaOwner | null> => ({ accountType: "COMPANY", profileId: "user-1" })
);

// Signature verification is exercised for real here; only its key source is stubbed.
mock.module("@vortexfi/shared", sharedModuleMock);
mock.module("../../config/logger", loggerModuleMock);
mock.module("../services/avenia/verification-notifications", () => ({ enqueueVerificationNotification }));
// mock.module is process-global, so the rest of the service is spread back in: stubbing the
// lookup alone would strip upsertAveniaKycCase from every test file loaded after this one.
const aveniaCustomerService = await import("../services/avenia/avenia-customer.service");
mock.module("../services/avenia/avenia-customer.service", () => ({
  ...aveniaCustomerService,
  findAveniaOwnerBySubaccountId
}));

const { handleAveniaWebhook } = await import("./avenia-webhook.controller");

// Mirrors the production mount in config/express.ts: raw body, ahead of any JSON parser.
const app = express();
app.post("/v1/webhooks/avenia", bodyParser.raw({ type: "*/*" }), handleAveniaWebhook);
const server = app.listen(0);
const port = (server.address() as { port: number }).port;

const EVENT = JSON.stringify({
  data: { attempt: { id: "attempt-1", result: "APPROVED", status: "COMPLETED", updatedAt: "2026-07-29T10:00:00Z" } },
  subAccountId: "sub-1",
  subscription: "KYC"
});

function post(body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== undefined) {
    headers.signature = signature;
  }

  return fetch(`http://127.0.0.1:${port}/v1/webhooks/avenia`, { body, headers, method: "POST" });
}

function signed(body: string): Promise<Response> {
  return post(body, sign(Buffer.from(body), primaryKeys.privateKey));
}

describe("handleAveniaWebhook", () => {
  beforeEach(() => {
    keyServer.servedKey = primaryKeys.publicKey;
    enqueueVerificationNotification.mockClear();
    findAveniaOwnerBySubaccountId.mockClear();
    findAveniaOwnerBySubaccountId.mockImplementation(async () => ({ accountType: "COMPANY", profileId: "user-1" }));
  });

  it("enqueues a verification email for a known subaccount", async () => {
    const response = await signed(EVENT);

    expect(response.status).toBe(200);
    expect(enqueueVerificationNotification).toHaveBeenCalledTimes(1);
    expect(enqueueVerificationNotification.mock.calls[0]?.[1]).toBe("user-1");
  });

  it("verifies the exact bytes received rather than a reparsed body", async () => {
    // Whitespace a JSON round-trip would drop still has to satisfy the signature.
    const body = `{ "subAccountId":"sub-1",  "subscription":"KYC",\n"data":{"attempt":{"id":"attempt-2","status":"EXPIRED"}} }`;

    const response = await signed(body);

    expect(response.status).toBe(200);
    expect(enqueueVerificationNotification.mock.calls[0]?.[0].id).toBe("attempt-2");
  });

  it("rejects a body signed with the wrong key without touching the database", async () => {
    const response = await post(EVENT, sign(Buffer.from(EVENT), rotatedKeys.privateKey));

    expect(response.status).toBe(401);
    expect(findAveniaOwnerBySubaccountId).not.toHaveBeenCalled();
    expect(enqueueVerificationNotification).not.toHaveBeenCalled();
  });

  it("rejects a body altered after signing", async () => {
    const signature = sign(Buffer.from(EVENT), primaryKeys.privateKey);

    const response = await post(EVENT.replace("sub-1", "sub-9"), signature);

    expect(response.status).toBe(401);
    expect(enqueueVerificationNotification).not.toHaveBeenCalled();
  });

  it("rejects a request carrying no signature header", async () => {
    const response = await post(EVENT);

    expect(response.status).toBe(401);
  });

  it("acknowledges events that carry no verification attempt", async () => {
    const response = await signed(JSON.stringify({ data: { ticket: {} }, subAccountId: "sub-1", subscription: "TICKET" }));

    expect(response.status).toBe(200);
    expect(enqueueVerificationNotification).not.toHaveBeenCalled();
  });

  it("acknowledges an unknown or partner-owned subaccount so Avenia stops retrying", async () => {
    findAveniaOwnerBySubaccountId.mockImplementation(async () => null);

    const response = await signed(EVENT);

    expect(response.status).toBe(200);
    expect(enqueueVerificationNotification).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    const response = await signed("not json");

    expect(response.status).toBe(400);
  });
});

afterAll(() => {
  server.close();
});
