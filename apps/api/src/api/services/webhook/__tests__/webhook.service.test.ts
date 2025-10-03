import { describe, it, expect, beforeEach } from 'bun:test';
import { mock } from 'bun:test';
import { WebhookService } from '../webhook.service';
import { APIError } from '../../../errors/api-error';

// Create mock functions first
const createMock = mock(() => {});
const findByPkMock = mock(() => {});
const findAllMock = mock(() => {});
const destroyMock = mock(() => {});

// Mock WebhookService's generateWebhookSecret method
WebhookService.prototype.generateWebhookSecret = () => 'test-webhook-secret';

// Mock modules
mock.module('../../../../models/webhook.model', () => ({
  default: {
    create: createMock,
    findByPk: findByPkMock,
    findAll: findAllMock
  }
}));

mock.module('../../../../config/logger', () => ({
  default: {
    info: mock(() => {}),
    error: mock(() => {})
  }
}));

// Import mocked modules
import Webhook from '../../../../models/webhook.model';

describe('WebhookService', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();

    // Reset mocks
    createMock.mockReset();
    findByPkMock.mockReset();
    findAllMock.mockReset();
    destroyMock.mockReset();
  });

  describe('registerWebhook', () => {
    it('should register a webhook with transactionId', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-123',
        url: 'https://example.com/webhook',
        transactionId: 'tx-123',
        sessionId: null,
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        secret: 'test-webhook-secret',
        createdAt: new Date('2025-01-15T10:30:00.000Z'),
        toJSON: () => ({
          id: 'webhook-123',
          url: 'https://example.com/webhook',
          transactionId: 'tx-123',
          sessionId: null,
          events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
          isActive: true,
          createdAt: new Date('2025-01-15T10:30:00.000Z'),
        })
      };

      // Setup mocks
      createMock.mockImplementation(() => Promise.resolve(mockWebhook));

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        transactionId: 'tx-123'
      });

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        secret: 'test-webhook-secret',
        sessionId: null,
        transactionId: 'tx-123',
        url: 'https://example.com/webhook'
      });

      expect(result).toEqual({
        id: 'webhook-123',
        url: 'https://example.com/webhook',
        transactionId: 'tx-123',
        sessionId: null,
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        createdAt: '2025-01-15T10:30:00.000Z'
      });
    });

    it('should register a webhook with sessionId', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-456',
        url: 'https://example.com/webhook',
        transactionId: null,
        sessionId: 'session-456',
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        secret: 'test-webhook-secret',
        createdAt: new Date('2025-01-15T10:30:00.000Z'),
        toJSON: () => ({
          id: 'webhook-456',
          url: 'https://example.com/webhook',
          transactionId: null,
          sessionId: 'session-456',
          events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
          isActive: true,
          createdAt: new Date('2025-01-15T10:30:00.000Z'),
        })
      };

      // Setup mocks
      createMock.mockImplementation(() => Promise.resolve(mockWebhook));

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        sessionId: 'session-456'
      });

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        secret: 'test-webhook-secret',
        sessionId: 'session-456',
        transactionId: null,
        url: 'https://example.com/webhook'
      });

      expect(result).toEqual({
        id: 'webhook-456',
        url: 'https://example.com/webhook',
        transactionId: null,
        sessionId: 'session-456',
        events: ['TRANSACTION_CREATED', 'STATUS_CHANGE'],
        isActive: true,
        createdAt: '2025-01-15T10:30:00.000Z'
      });
    });

    it('should handle registration errors', async () => {
      // Setup mocks
      createMock.mockImplementation(() => Promise.reject(new Error('Database error')));

      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        transactionId: 'tx-123'
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject non-HTTPS URLs', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'http://example.com/webhook',
        transactionId: 'tx-123'
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject invalid event types', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        transactionId: 'tx-123',
        events: ['INVALID_EVENT']
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject when neither transactionId nor sessionId is provided', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook'
      })).rejects.toBeInstanceOf(APIError);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete an existing webhook', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-123',
        destroy: destroyMock
      };

      // Setup destroy mock
      destroyMock.mockImplementation(() => Promise.resolve(true));

      // Setup findByPk mock
      findByPkMock.mockImplementation(() => Promise.resolve(mockWebhook));

      // Execute
      const result = await webhookService.deleteWebhook('webhook-123');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('webhook-123');
      expect(destroyMock).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when webhook not found', async () => {
      // Setup mocks
      findByPkMock.mockImplementation(() => Promise.resolve(null));

      // Execute
      const result = await webhookService.deleteWebhook('non-existent-id');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('non-existent-id');
      expect(result).toBe(false);
    });

    it('should handle deletion errors', async () => {
      // Setup mocks
      findByPkMock.mockImplementation(() => Promise.reject(new Error('Database error')));

      // Execute and verify
      await expect(webhookService.deleteWebhook('webhook-123'))
        .rejects.toBeInstanceOf(APIError);
    });
  });

  describe('findWebhooksForEvent', () => {
    it('should find webhooks for a specific transaction', async () => {
      // Mock data
      const mockWebhooks = [
        { id: 'webhook-1', transactionId: 'tx-123' },
        { id: 'webhook-2', transactionId: null, sessionId: null }
      ];

      // Setup mocks
      findAllMock.mockImplementation(() => Promise.resolve(mockWebhooks));

      // Execute
      const result = await webhookService.findWebhooksForEvent('TRANSACTION_CREATED', 'tx-123');

      // Verify
      expect(findAllMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          events: expect.any(Object),
          isActive: true
        })
      });
      expect(result).toEqual(mockWebhooks);
    });
  });
});