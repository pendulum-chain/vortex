import { describe, it, expect, beforeEach } from 'bun:test';
import { mock } from 'bun:test';
import { WebhookService } from '../webhook.service';
import { APIError } from '../../../errors/api-error';
import { WebhookEventType, RegisterWebhookRequest, RegisterWebhookResponse } from '@packages/shared';
import Webhook, { WebhookAttributes } from '../../../../models/webhook.model';

// Mock factory functions
const createMockWebhook = (overrides: Partial<WebhookAttributes> = {}) => ({
  id: 'webhook-123',
  url: 'https://example.com/webhook',
  quoteId: 'quote-123',
  sessionId: null,
  events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
  isActive: true,
  createdAt: new Date('2025-01-15T10:30:00.000Z'),
  updatedAt: new Date('2025-01-15T10:30:00.000Z'),
  ...overrides
} as Webhook);

const createMockRampState = (overrides: Partial<{ id: string }> = {}) => ({
  id: 'tx-123',
  ...overrides
});

const createMockWebhookArray = (webhooks: Partial<WebhookAttributes>[] = []) =>
  webhooks.length > 0 ? webhooks.map(webhook => createMockWebhook(webhook)) : [
    createMockWebhook({ id: 'webhook-1', quoteId: 'quote-123' }),
    createMockWebhook({ id: 'webhook-2', quoteId: null, sessionId: null })
  ];

// Create mock functions first
const createMock = mock(async (): Promise<any> => ({}));
const findByPkMock = mock(async (): Promise<any> => ({}));
const findAllMock = mock(async (): Promise<any[]> => ([]));
const destroyMock = mock(async (): Promise<any> => true);
const updateMock = mock(async (): Promise<any> => ({}));

// Mock RampState
const rampStateFindByPkMock = mock(async (): Promise<any> => ({}));

// Mock crypto
const randomBytesMock = mock(() => Buffer.from('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'hex'));

mock.module('crypto', () => ({
  default: {
    randomBytes: randomBytesMock
  },
  randomBytes: randomBytesMock
}));

// Mock modules
mock.module('../../../../models/webhook.model', () => ({
  default: {
    create: createMock,
    findByPk: findByPkMock,
    findAll: findAllMock
  }
}));

mock.module('../../../../models/rampState.model', () => ({
  default: {
    findByPk: rampStateFindByPkMock
  }
}));

mock.module('../../../../config/logger', () => ({
  default: {
    info: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
    warn: mock(() => {})
  }
}));

describe('WebhookService', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();
    createMock.mockReset();
    findByPkMock.mockReset();
    findAllMock.mockReset();
    destroyMock.mockReset();
    updateMock.mockReset();
    rampStateFindByPkMock.mockReset();
    randomBytesMock.mockReset();

    // Setup default crypto mock
    randomBytesMock.mockReturnValue(Buffer.from('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'hex'));
  });

  describe('registerWebhook', () => {
    it('should register a webhook with quoteId', async () => {
      const mockWebhook = createMockWebhook();

      // Setup mocks
      rampStateFindByPkMock.mockResolvedValue(createMockRampState()); // Quote exists
      createMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      });

      // Verify
      expect(rampStateFindByPkMock).toHaveBeenCalledWith('quote-123');
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        sessionId: null,
        quoteId: 'quote-123',
        url: 'https://example.com/webhook'
      });

      expect(result).toEqual({
        id: 'webhook-123',
        url: 'https://example.com/webhook',
        quoteId: 'quote-123',
        sessionId: null,
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        createdAt: '2025-01-15T10:30:00.000Z'
      });
    });

    it('should register a webhook with sessionId', async () => {
      const mockWebhook = createMockWebhook({
        id: 'webhook-456',
        quoteId: null,
        sessionId: 'session-456'
      });

      // Setup mocks
      createMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        sessionId: 'session-456'
      });

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        sessionId: 'session-456',
        quoteId: null,
        url: 'https://example.com/webhook'
      });

      expect(result).toEqual({
        id: 'webhook-456',
        url: 'https://example.com/webhook',
        quoteId: null,
        sessionId: 'session-456',
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        createdAt: '2025-01-15T10:30:00.000Z'
      });
    });

    it('should register a webhook with custom events', async () => {
      const mockWebhook = createMockWebhook({
        id: 'webhook-789',
        quoteId: null,
        sessionId: 'session-789',
        events: [WebhookEventType.STATUS_CHANGE]
      });

      // Setup mocks
      createMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        sessionId: 'session-789',
        events: [WebhookEventType.STATUS_CHANGE]
      });

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.STATUS_CHANGE],
        isActive: true,
        sessionId: 'session-789',
        quoteId: null,
        url: 'https://example.com/webhook'
      });

      expect(result.events).toEqual([WebhookEventType.STATUS_CHANGE]);
    });

    it('should handle registration errors', async () => {
      // Setup mocks
      createMock.mockRejectedValue(new Error('Database error'));

      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject non-HTTPS URLs', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'http://example.com/webhook',
        quoteId: 'quote-123'
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject missing URL', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        quoteId: 'quote-123'
      } as any)).rejects.toBeInstanceOf(APIError);
    });

    it('should reject invalid event types', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123',
        events: ['INVALID_EVENT' as any]
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject empty events array', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123',
        events: []
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject when neither quoteId nor sessionId is provided', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook'
      })).rejects.toBeInstanceOf(APIError);
    });

    it('should reject when quoteId does not exist', async () => {
      // Setup mocks - quote not found
      rampStateFindByPkMock.mockResolvedValue(null);

      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'non-existent-quote'
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

      // Setup mocks
      destroyMock.mockResolvedValue(true);
      findByPkMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.deleteWebhook('webhook-123');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('webhook-123');
      expect(destroyMock).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when webhook not found', async () => {
      // Setup mocks
      findByPkMock.mockResolvedValue(null);

      // Execute
      const result = await webhookService.deleteWebhook('non-existent-id');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('non-existent-id');
      expect(result).toBe(false);
    });

    it('should handle deletion errors', async () => {
      // Setup mocks
      findByPkMock.mockRejectedValue(new Error('Database error'));

      // Execute and verify
      await expect(webhookService.deleteWebhook('webhook-123'))
        .rejects.toBeInstanceOf(APIError);
    });
  });

  describe('findWebhooksForEvent', () => {
    it('should find webhooks for a specific quote', async () => {
      // Use mock factory
      const mockWebhooks = createMockWebhookArray([
        { id: 'webhook-1', quoteId: 'quote-123', events: [WebhookEventType.TRANSACTION_CREATED] },
        { id: 'webhook-2', quoteId: null, sessionId: null, events: [WebhookEventType.TRANSACTION_CREATED] }
      ]);

      // Setup mocks
      findAllMock.mockResolvedValue(mockWebhooks);

      // Execute
      const result = await webhookService.findWebhooksForEvent(
        WebhookEventType.TRANSACTION_CREATED,
        'quote-123'
      );

      // Verify
      expect(findAllMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          events: expect.any(Object),
          isActive: true
        })
      });
      expect(result).toEqual(mockWebhooks);
    });

    it('should find webhooks for session and quote', async () => {
      // Use mock factory
      const mockWebhooks = createMockWebhookArray([
        { id: 'webhook-1', quoteId: 'quote-123', events: [WebhookEventType.STATUS_CHANGE] },
        { id: 'webhook-2', quoteId: null, sessionId: 'session-456', events: [WebhookEventType.STATUS_CHANGE] },
        { id: 'webhook-3', quoteId: null, sessionId: null, events: [WebhookEventType.STATUS_CHANGE] }
      ]);

      // Setup mocks
      findAllMock.mockResolvedValue(mockWebhooks);

      // Execute
      const result = await webhookService.findWebhooksForEvent(
        WebhookEventType.STATUS_CHANGE,
        'quote-123',
        'session-456'
      );

      // Verify
      expect(findAllMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          events: expect.any(Object),
          isActive: true
        })
      });
      expect(result).toEqual(mockWebhooks);
    });

    it('should handle errors gracefully', async () => {
      // Setup mocks
      findAllMock.mockRejectedValue(new Error('Database error'));

      // Execute
      const result = await webhookService.findWebhooksForEvent(
        WebhookEventType.TRANSACTION_CREATED,
        'quote-123'
      );

      // Verify - should return empty array on error
      expect(result).toEqual([]);
    });
  });

  describe('getWebhookById', () => {
    it('should get webhook by ID', async () => {
      // Use mock factory
      const mockWebhook = createMockWebhook({
        url: 'https://example.com',
        events: [WebhookEventType.TRANSACTION_CREATED]
      });

      // Setup mocks
      findByPkMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.getWebhookById('webhook-123');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('webhook-123');
      expect(result).toEqual(mockWebhook);
    });

    it('should return null when webhook not found', async () => {
      // Setup mocks
      findByPkMock.mockResolvedValue(null);

      // Execute
      const result = await webhookService.getWebhookById('non-existent');

      // Verify
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Setup mocks
      findByPkMock.mockRejectedValue(new Error('Database error'));

      // Execute
      const result = await webhookService.getWebhookById('webhook-123');

      // Verify - should return null on error
      expect(result).toBeNull();
    });
  });

  describe('deactivateWebhook', () => {
    it('should deactivate an existing webhook', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-123',
        update: updateMock
      };

      // Setup mocks
      updateMock.mockResolvedValue(true);
      findByPkMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.deactivateWebhook('webhook-123');

      // Verify
      expect(findByPkMock).toHaveBeenCalledWith('webhook-123');
      expect(updateMock).toHaveBeenCalledWith({ isActive: false });
      expect(result).toBe(true);
    });

    it('should return false when webhook not found', async () => {
      // Setup mocks
      findByPkMock.mockResolvedValue(null);

      // Execute
      const result = await webhookService.deactivateWebhook('non-existent');

      // Verify
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      // Setup mocks
      findByPkMock.mockRejectedValue(new Error('Database error'));

      // Execute
      const result = await webhookService.deactivateWebhook('webhook-123');

      // Verify - should return false on error
      expect(result).toBe(false);
    });
  });
});
