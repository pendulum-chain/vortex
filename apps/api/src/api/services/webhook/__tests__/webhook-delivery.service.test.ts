import { describe, it, expect, beforeEach } from 'bun:test';
import { mock } from 'bun:test';
import { WebhookDeliveryService } from '../webhook-delivery.service';
import { RampDirection } from '@packages/shared';

// Create mock functions first
const findWebhooksForEventMock = mock(() => {});
const getWebhookByIdMock = mock(() => {});
const deactivateWebhookMock = mock(() => {});
const fetchMock = mock(() => {});

// Mock dependencies
mock.module('../webhook.service', () => ({
  default: {
    findWebhooksForEvent: findWebhooksForEventMock,
    getWebhookById: getWebhookByIdMock,
    deactivateWebhook: deactivateWebhookMock
  }
}));

// Mock crypto
mock.module('crypto', () => ({
  createHmac: () => ({
    update: () => ({
      digest: () => 'test-signature'
    })
  })
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

// Import mocked modules
import webhookService from '../webhook.service';

describe('WebhookDeliveryService', () => {
  let webhookDeliveryService: WebhookDeliveryService;

  // Store original functions
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  // Setup mocks
  global.fetch = fetchMock;
  global.setTimeout = mock((callback, ms) => {
    return 123 as any; // Return a dummy timeout ID
  });
  global.clearTimeout = mock(() => {});

  beforeEach(() => {
    webhookDeliveryService = new WebhookDeliveryService();

    // Reset mocks
    findWebhooksForEventMock.mockReset();
    getWebhookByIdMock.mockReset();
    deactivateWebhookMock.mockReset();
    fetchMock.mockReset();
  });

  // Make sure to restore globals after all tests are done
  // Since Bun doesn't have afterAll, we'll do this in a separate test that runs last
  describe('cleanup', () => {
    it('should restore global functions', () => {
      // Restore original functions
      global.fetch = originalFetch;
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;

      // This test doesn't actually assert anything, it just does cleanup
      expect(true).toBe(true);
    });
  });

  describe('triggerTransactionCreated', () => {
    it('should trigger webhooks for transaction created event', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        },
        {
          id: 'webhook-2',
          url: 'https://example.com/webhook2',
          secret: 'secret2'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockImplementation(() => Promise.resolve(mockWebhooks));
      fetchMock.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200
      } as Response));

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        'TRANSACTION_CREATED',
        'tx-123',
        'session-456'
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/webhook1');
    });

    it('should do nothing when no webhooks are found', async () => {
      // Setup mocks
      findWebhooksForEventMock.mockImplementation(() => Promise.resolve([]));

      // Execute
      await webhookDeliveryService.triggerTransactionCreated(
        'tx-123',
        'session-456',
        RampDirection.BUY
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        'TRANSACTION_CREATED',
        'tx-123',
        'session-456'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('triggerStatusChange', () => {
    it('should trigger webhooks for status change event', async () => {
      // Mock data
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1'
        }
      ];

      // Setup mocks
      findWebhooksForEventMock.mockImplementation(() => Promise.resolve(mockWebhooks));
      fetchMock.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200
      } as Response));

      // Execute
      await webhookDeliveryService.triggerStatusChange(
        'tx-123',
        'session-456',
        'complete',
        RampDirection.SELL
      );

      // Verify
      expect(findWebhooksForEventMock).toHaveBeenCalledWith(
        'STATUS_CHANGE',
        'tx-123',
        'session-456'
      );

      expect(fetchMock).toHaveBeenCalled();

      // Check payload contains correct status mapping
      const fetchCall = fetchMock.mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      expect(payload.payload.transactionStatus).toBe('COMPLETE');
      expect(payload.payload.transactionType).toBe('SELL');
    });
  });

  describe('testWebhookDelivery', () => {
    it('should test webhook delivery successfully', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-1',
        url: 'https://example.com/webhook1',
        secret: 'secret1'
      };

      // Setup mocks
      getWebhookByIdMock.mockImplementation(() => Promise.resolve(mockWebhook));
      fetchMock.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200
      } as Response));

      // Execute
      const result = await webhookDeliveryService.testWebhookDelivery('webhook-1');

      // Verify
      expect(getWebhookByIdMock).toHaveBeenCalledWith('webhook-1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/webhook1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Vortex-Signature': 'sha256=test-signature'
          })
        })
      );
      expect(result).toBe(true);
    });

    it('should return false when webhook not found', async () => {
      // Setup mocks
      getWebhookByIdMock.mockImplementation(() => Promise.resolve(null));

      // Execute
      const result = await webhookDeliveryService.testWebhookDelivery('non-existent');

      // Verify
      expect(getWebhookByIdMock).toHaveBeenCalledWith('non-existent');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});