import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { RampDirection, TransactionStatus, WebhookEventType } from "@vortexfi/shared";
import cryptoService from "../../../../config/crypto";
import { WebhookDeliveryService } from "../webhook-delivery.service";
import webhookService from "../webhook.service";

// The service signs payloads with the real cryptoService singleton (RSA-PSS,
// raw base64 in X-Vortex-Signature) and uses the webhookService singleton for
// lookup/deactivation. No mock.module here — bun module mocks are process-wide
// and leak into other test files. Instead: real keys initialized once, the two
// webhookService methods patched on the instance (originals captured below and
// restored in afterAll), and globalThis.fetch stubbed per test.

const originalFetch = globalThis.fetch;
const originalFindWebhooksForEvent = webhookService.findWebhooksForEvent;
const originalDeactivateWebhook = webhookService.deactivateWebhook;

const findWebhooksForEventMock = mock(async (): Promise<unknown[]> => []);
const deactivateWebhookMock = mock(async (): Promise<boolean> => true);

// IP-literal URLs keep the tests hermetic: the pre-delivery SSRF guard validates
// IP literals without a DNS lookup. 93.184.216.34 (example.com, a real public
// address) passes the guard; fetch is always stubbed, so nothing leaves the box.
const fakeWebhook = (overrides: Record<string, unknown> = {}) => ({
  id: "webhook-1",
  url: "https://93.184.216.34/hook",
  ...overrides
});

// Real timers, but backoff shrunk from 1s..16s to 1ms per attempt so the
// retry tests finish instantly. timeoutMs is shrunk so the per-attempt abort
// timer left dangling on rejected fetches fires (harmlessly) right away.
const createService = () => {
  const service = new WebhookDeliveryService();
  (service as unknown as { retryDelays: number[] }).retryDelays = [1, 1, 1, 1, 1];
  (service as unknown as { timeoutMs: number }).timeoutMs = 50;
  return service;
};

let fetchMock: ReturnType<typeof mock>;
const stubFetch = (impl: () => Promise<Response>) => {
  fetchMock = mock(impl);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

const fetchCall = (index: number) => {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { body: init.body as string, headers: init.headers as Record<string, string>, init, url };
};

describe("WebhookDeliveryService", () => {
  let service: WebhookDeliveryService;

  beforeAll(() => {
    cryptoService.initializeKeys();
    (webhookService as { findWebhooksForEvent: unknown }).findWebhooksForEvent = findWebhooksForEventMock;
    (webhookService as { deactivateWebhook: unknown }).deactivateWebhook = deactivateWebhookMock;
  });

  afterAll(() => {
    webhookService.findWebhooksForEvent = originalFindWebhooksForEvent;
    webhookService.deactivateWebhook = originalDeactivateWebhook;
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    service = createService();
    findWebhooksForEventMock.mockReset();
    findWebhooksForEventMock.mockResolvedValue([]);
    deactivateWebhookMock.mockReset();
    deactivateWebhookMock.mockResolvedValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("triggerTransactionCreated", () => {
    it("delivers the signed payload to every matching webhook", async () => {
      findWebhooksForEventMock.mockResolvedValue([
        fakeWebhook({ id: "webhook-1", url: "https://93.184.216.34/hook1" }),
        fakeWebhook({ id: "webhook-2", url: "https://93.184.216.34/hook2" })
      ]);
      stubFetch(async () => new Response(null, { status: 200 }));

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      expect(findWebhooksForEventMock).toHaveBeenCalledWith(WebhookEventType.TRANSACTION_CREATED, "quote-123", "session-456");
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchCall(0).url).toBe("https://93.184.216.34/hook1");
      expect(fetchCall(1).url).toBe("https://93.184.216.34/hook2");

      const payload = JSON.parse(fetchCall(0).body);
      expect(payload).toEqual({
        eventId: expect.any(String),
        eventType: WebhookEventType.TRANSACTION_CREATED,
        payload: {
          quoteId: "quote-123",
          sessionId: "session-456",
          transactionId: "tx-789",
          transactionStatus: TransactionStatus.PENDING,
          transactionType: RampDirection.BUY
        },
        timestamp: expect.any(String)
      });
      expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false);
      // Both webhooks receive the identical payload
      expect(fetchCall(1).body).toBe(fetchCall(0).body);
    });

    it("does nothing when no webhooks match", async () => {
      stubFetch(async () => new Response(null, { status: 200 }));

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      expect(findWebhooksForEventMock).toHaveBeenCalledWith(WebhookEventType.TRANSACTION_CREATED, "quote-123", "session-456");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("resolves without throwing when the webhook lookup fails", async () => {
      findWebhooksForEventMock.mockRejectedValue(new Error("db down"));
      stubFetch(async () => new Response(null, { status: 200 }));

      await expect(
        service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY)
      ).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("retry and deactivation", () => {
    it("retries up to maxRetries on HTTP failures, then deactivates the webhook", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      stubFetch(async () => new Response(null, { status: 500 }));

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(deactivateWebhookMock).toHaveBeenCalledWith("webhook-1");
    });

    it("stops retrying once a delivery succeeds", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      let attempts = 0;
      stubFetch(async () => {
        attempts++;
        return new Response(null, { status: attempts < 3 ? 502 : 200 });
      });

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(deactivateWebhookMock).not.toHaveBeenCalled();
    });

    it("keeps the eventId stable across delivery retries", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      let attempts = 0;
      stubFetch(async () => {
        attempts++;
        return new Response(null, { status: attempts < 3 ? 502 : 200 });
      });

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      const first = JSON.parse(fetchCall(0).body);
      const last = JSON.parse(fetchCall(2).body);
      expect(first.eventId).toEqual(expect.any(String));
      expect(last.eventId).toBe(first.eventId);
    });

    it("never fetches a webhook whose URL points at a private address, and deactivates it", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook({ url: "https://10.0.0.5/hook" })]);
      stubFetch(async () => new Response(null, { status: 200 }));

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(deactivateWebhookMock).toHaveBeenCalledWith("webhook-1");
    });

    it("treats network errors like failures and deactivates after maxRetries without throwing", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      stubFetch(async () => {
        throw new Error("connection refused");
      });

      await expect(
        service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY)
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(deactivateWebhookMock).toHaveBeenCalledWith("webhook-1");
    });
  });

  describe("triggerStatusChange", () => {
    it("maps ramp phases to transaction statuses in the payload", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      stubFetch(async () => new Response(null, { status: 200 }));

      const cases: [string, TransactionStatus][] = [
        ["complete", TransactionStatus.COMPLETE],
        ["failed", TransactionStatus.FAILED],
        ["timedOut", TransactionStatus.FAILED],
        ["pendulumCleanup", TransactionStatus.PENDING]
      ];

      for (const [index, [phase, expectedStatus]] of cases.entries()) {
        await service.triggerStatusChange("quote-123", "session-456", "tx-789", phase, RampDirection.SELL);

        const payload = JSON.parse(fetchCall(index).body);
        expect(payload.eventType).toBe(WebhookEventType.STATUS_CHANGE);
        expect(payload.payload).toEqual({
          quoteId: "quote-123",
          sessionId: "session-456",
          transactionId: "tx-789",
          transactionStatus: expectedStatus,
          transactionType: RampDirection.SELL
        });
      }

      expect(findWebhooksForEventMock).toHaveBeenCalledWith(WebhookEventType.STATUS_CHANGE, "quote-123", "session-456");
      expect(fetchMock).toHaveBeenCalledTimes(cases.length);
    });

    it("does nothing when no webhooks match", async () => {
      stubFetch(async () => new Response(null, { status: 200 }));

      await service.triggerStatusChange("quote-123", "session-456", "tx-789", "complete", RampDirection.SELL);

      expect(findWebhooksForEventMock).toHaveBeenCalledWith(WebhookEventType.STATUS_CHANGE, "quote-123", "session-456");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("request format", () => {
    it("sends a POST with JSON headers, a unix timestamp, and a verifiable RSA-PSS signature", async () => {
      findWebhooksForEventMock.mockResolvedValue([fakeWebhook()]);
      stubFetch(async () => new Response(null, { status: 200 }));

      await service.triggerTransactionCreated("quote-123", "session-456", "tx-789", RampDirection.BUY);

      const { body, headers, init } = fetchCall(0);
      expect(init.method).toBe("POST");
      // Redirects must be rejected so a public host cannot bounce the delivery
      // to a private address.
      expect(init.redirect).toBe("error");
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["User-Agent"]).toBe("Vortex-Webhooks/1.0");

      // Freshness timestamp: unix seconds, close to now
      expect(headers["X-Vortex-Timestamp"]).toMatch(/^\d+$/);
      expect(Math.abs(Number(headers["X-Vortex-Timestamp"]) - Date.now() / 1000)).toBeLessThan(60);

      // Raw base64 RSA-PSS signature over `${timestamp}.${body}` — binding the
      // timestamp so a captured body+signature cannot be replayed with a fresh
      // timestamp. No "sha256=" prefix (that belonged to the removed HMAC scheme).
      const signature = headers["X-Vortex-Signature"];
      expect(signature.startsWith("sha256=")).toBe(false);
      expect(cryptoService.verifySignature(`${headers["X-Vortex-Timestamp"]}.${body}`, signature)).toBe(true);
      // Neither the body alone nor a shifted timestamp verifies
      expect(cryptoService.verifySignature(body, signature)).toBe(false);
      expect(cryptoService.verifySignature(`${Number(headers["X-Vortex-Timestamp"]) + 1}.${body}`, signature)).toBe(false);
    });
  });
});
