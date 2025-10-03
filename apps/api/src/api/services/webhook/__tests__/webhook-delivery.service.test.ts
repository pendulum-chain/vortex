import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mock } from 'bun:test';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { RampDirection, WebhookEventType } from '@packages/shared';

// Mock factory functions
const createMockWebhook = (overrides: Partial<any> = {}) => ({
  id: 'webhook-1',
  url: 'https://example.com/webhook1',
  secret: 'secret1',
  ...overrides
});

const createMockWebhookArray = (webhooks: Partial<any>[] = []) =>
  webhooks.length > 0 ? webhooks.map(webhook => createMockWebhook(webhook)) : [
    createMockWebhook({ id: 'webhook-1', url: 'https://example.com/webhook1', secret: 'secret1' })
  ];

const createMockResponse = (overrides: Partial<Response> = {}) => ({
  ok: true,
  status: 200,
  ...overrides
} as Response);

// Create mock functions first
const findWebhooksForEventMock = mock(async (): Promise<any[]> => []);
const getWebhookByIdMock = mock(async (): Promise<any> => ({}));
const deactivateWebhookMock = mock(async (): Promise<boolean> => true);

// Mock fetch globally
const originalFetch = global.fetch;
const fetchMock = mock(async (url: string, options?: RequestInit): Promise<Response> => ({
  ok: true,
  status: 200
} as Response));

// Mock AbortController
const abortMock = mock(() => {});
const originalAbortController = global.AbortController;
const mockAbortController = class MockAbortController {
  signal = { aborted: false };
  abort = abortMock;
};

// Mock setTimeout and clearTimeout
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
const setTimeoutMock = mock((callback: Function, ms: number) => {
  // For testing, we can call the callback immediately or return a dummy timeout ID
  return 123 as any;
});
const clearTimeoutMock = mock(() => {});

// Mock crypto
const createHmacMock = mock(() => ({
  update: mock(() => ({
    digest: mock(() => 'test-signature-hash')
  }))
}));

mock.module('crypto', () => ({
  default: {
    createHmac: createHmacMock
  },
  createHmac: createHmacMock
}));

// Mock dependencies
mock.module('../webhook.service', () => ({
  default: {
    findWebhooksForEvent: findWebhooksForEventMock,
    getWebhookById: getWebhookByIdMock,
    deactivateWebhook: deactivateWebhookMock
  }
}));

// Mock logger
mock.module('../../../../config/logger', () => ({
  default: {
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    warn: mock(() => {})
  }
}));

describe('WebhookDeliveryService', () => {
  let webhookDeliveryService: WebhookDeliveryService;

  beforeEach(() => {
    webhookDeliveryService = new WebhookDeliveryService();

    // Setup global mocks
    global.fetch = fetchMock as any;
    global.AbortController = mockAbortController as any;
    global.setTimeout = setTimeoutMock as any;
    global.clearTimeout = clearTimeoutMock as any;

    // Reset all mocks
    findWebhooksForEventMock.mockReset();
    getWebhookByIdMock.mockReset();
    deactivateWebhookMock.mockReset();
    fetchMock.mockReset();
    abortMock.mockReset();
    setTimeoutMock.mockReset();
    clearTimeoutMock.mockReset();
    createHmacMock.mockReset();

    // Setup default mock return values
    createHmacMock.mockReturnValue({
      update: mock(() => ({
        digest: mock(() => 'test-signature-hash')
      }))
    });
  });

  afterEach(() => {
    // Restore globals
    global.fetch = originalFetch;
    global.AbortController = originalAbortController;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  describe('triggerTransactionCreated', () => {
    it('should trigger webhooks for transaction created event', async () => {
      // Use mock factory
      const mockWebhooks = createMockWebhookArray([
        { id: 'webhook-1', url: 'https://example.com/webhook1', secret: 'secret1' },
        { id: 'webhook-2', url: 'https://example.com/webhook2', secret: 'secret2' }
      ]);

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue(createMockResponse());

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        WebhookEventType.TRANSACTION_CREATED,
        'tx-123',
        'session-456'
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/webhook1');
      expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/webhook2');

      // Check payload structure
      const firstCallPayload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(firstCallPayload).toEqual({
        eventType: WebhookEventType.TRANSACTION_CREATED,
        timestamp: expect.any(String),
        payload: {
          sessionId: 'session-456',
          transactionId: 'tx-123',
          transactionStatus: 'PENDING',
          transactionType: RampDirection.BUY
        }
      });
    });

    it('should do nothing when no webhooks are found', async () => {
      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue([]);

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        WebhookEventType.TRANSACTION_CREATED,
        'tx-123',
        'session-456'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle webhook delivery failures', async () => {
      // Use mock factory
      const mockWebhooks = createMockWebhookArray([
        { id: 'webhook-1', url: 'https://example.com/webhook1', secret: 'secret1' }
      ]);

      // Setup mocks - webhook delivery fails
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue(createMockResponse({ ok: false, status: 500 }));

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify that fetch was called multiple times (retries)
      expect(fetchMock).toHaveBeenCalled();
      // Should eventually deactivate webhook after max retries
      expect(deactivateWebhookMock).toHaveBeenCalledWith('webhook-1');
    });
  });

  describe('triggerStatusChange', () => {
    it('should trigger webhooks for status change event with complete status', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      } as Response);

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'complete',
        RampDirection.SELL
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        WebhookEventType.STATUS_CHANGE,
        'tx-123',
        'session-456'
      );

      expect(fetchMock).toHaveBeenCalled();

      // Check payload contains correct status mapping
      const fetchCall = fetchMock.mock.calls[0];
      const payload = JSON.parse(fetchCall[1]!.body as string);
      expect(payload.eventType).toBe(WebhookEventType.STATUS_CHANGE);
      expect(payload.payload.transactionStatus).toBe('COMPLETE');
      expect(payload.payload.transactionType).toBe(RampDirection.SELL);
      expect(payload.payload.transactionId).toBe('tx-123');
      expect(payload.payload.sessionId).toBe('session-456');
    });

    it('should trigger webhooks for status change event with failed status', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      } as Response);

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'failed',
        RampDirection.BUY
      );

      // Verify
      const fetchCall = fetchMock.mock.calls[0];
      const payload = JSON.parse(fetchCall[1]!.body as string);
      expect(payload.payload.transactionStatus).toBe('FAILED');
    });

    it('should trigger webhooks for status change event with timedOut status', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      } as Response);

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'timedOut',
        RampDirection.BUY
      );

      // Verify
      const fetchCall = fetchMock.mock.calls[0];
      const payload = JSON.parse(fetchCall[1]!.body as string);
      expect(payload.payload.transactionStatus).toBe('FAILED');
    });

    it('should trigger webhooks for status change event with pending status', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      } as Response);

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'someOtherPhase',
        RampDirection.BUY
      );

      // Verify
      const fetchCall = fetchMock.mock.calls[0];
      const payload = JSON.parse(fetchCall[1]!.body as string);
      expect(payload.payload.transactionStatus).toBe('PENDING');
    });

    it('should do nothing when no webhooks are found', async () => {
      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue([]);

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'complete',
        RampDirection.SELL
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        WebhookEventType.STATUS_CHANGE,
        'tx-123',
        'session-456'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('webhook delivery', () => {
    it('should include correct headers in webhook requests', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'webhook-secret'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200
      } as Response);

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify headers
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'Vortex-Webhooks/1.0',
            'X-Vortex-Signature': expect.stringMatching(/^sha256=/),
            'X-Vortex-Timestamp': expect.any(String)
          }),
          body: expect.any(String),
          signal: expect.any(Object)
        })
      );
    });

    it('should handle network errors gracefully', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks - network error
      findWebhooksForEventMock.mockResolvedValue(mockWebhooks);
      fetchMock.mockRejectedValue(new Error('Network error'));

      // Execute - should not throw
      await expect(webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      )).resolves.toBeUndefined();

      // Should eventually deactivate webhook after max retries
      expect(deactivateWebhookMock).toHaveBeenCalledWith('webhook-1');
    });
  });
});
