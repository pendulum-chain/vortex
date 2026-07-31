import { describe, it, expect, afterAll, beforeEach } from 'bun:test';
import { mock } from 'bun:test';
import { Op } from 'sequelize';
import * as webhookModelNamespace from '../../../../models/webhook.model';
import * as quoteTicketModelNamespace from '../../../../models/quoteTicket.model';
import * as loggerNamespace from '../../../../config/logger';
import { WebhookService, WebhookOwner } from '../webhook.service';

// Value copies taken before the mock.module calls below; restored in afterAll
// because bun module mocks are process-wide and would poison later test files.
const restorableModules: Array<[string, Record<string, unknown>]> = [
  ['../../../../models/webhook.model', { ...webhookModelNamespace }],
  ['../../../../models/quoteTicket.model', { ...quoteTicketModelNamespace }],
  ['../../../../config/logger', { ...loggerNamespace }]
];

afterAll(() => {
  for (const [path, real] of restorableModules) {
    mock.module(path, () => real);
  }
});
import { APIError } from '../../../errors/api-error';
import { WebhookEventType } from '@vortexfi/shared';
import Webhook, { WebhookAttributes } from '../../../../models/webhook.model';

const PARTNER_OWNER: WebhookOwner = { partnerId: 'partner-1', userId: null };
const USER_OWNER: WebhookOwner = { partnerId: null, userId: 'user-1' };

// Mock factory functions
const createMockWebhook = (overrides: Partial<WebhookAttributes> = {}) => ({
  id: 'webhook-123',
  url: 'https://example.com/webhook',
  quoteId: 'quote-123',
  sessionId: null,
  partnerId: 'partner-1',
  userId: null,
  events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
  isActive: true,
  createdAt: new Date('2025-01-15T10:30:00.000Z'),
  updatedAt: new Date('2025-01-15T10:30:00.000Z'),
  ...overrides
} as Webhook);

const createMockQuote = (overrides: Partial<{ id: string; partnerId: string | null; userId: string | null }> = {}) => ({
  id: 'quote-123',
  partnerId: 'partner-1',
  userId: null,
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
const findOneMock = mock(async (): Promise<any> => ({}));
const findAllMock = mock(async (): Promise<any[]> => ([]));
const destroyMock = mock(async (): Promise<any> => true);
const updateMock = mock(async (): Promise<any> => ({}));

const quoteTicketFindByPkMock = mock(async (): Promise<any> => ({}));

// Mock modules
mock.module('../../../../models/webhook.model', () => ({
  default: {
    create: createMock,
    findByPk: findByPkMock,
    findOne: findOneMock,
    findAll: findAllMock
  }
}));

// Production validates quoteId via QuoteTicket (webhook.service.ts), not RampState.
mock.module('../../../../models/quoteTicket.model', () => ({
  default: {
    findByPk: quoteTicketFindByPkMock
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
    findOneMock.mockReset();
    findAllMock.mockReset();
    destroyMock.mockReset();
    updateMock.mockReset();
    quoteTicketFindByPkMock.mockReset();
  });

  describe('registerWebhook', () => {
    it('should register a webhook with quoteId owned by the partner', async () => {
      const mockWebhook = createMockWebhook();

      // Setup mocks
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote());
      createMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, PARTNER_OWNER);

      // Verify
      expect(quoteTicketFindByPkMock).toHaveBeenCalledWith('quote-123');
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        partnerId: 'partner-1',
        sessionId: null,
        quoteId: 'quote-123',
        url: 'https://example.com/webhook',
        userId: null
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

    it('should register a quote webhook for a user-scoped key when the quote belongs to the user', async () => {
      const mockWebhook = createMockWebhook({ partnerId: null, userId: 'user-1' });

      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote({ partnerId: null, userId: 'user-1' }));
      createMock.mockResolvedValue(mockWebhook);

      await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, USER_OWNER);

      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
        partnerId: null,
        userId: 'user-1'
      }));
    });

    it('should reject a quote webhook when the quote belongs to another partner', async () => {
      // Quote exists but is owned by a different partner — must be indistinguishable
      // from a nonexistent quote (uniform 404).
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote({ partnerId: 'partner-other' }));

      const error = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, PARTNER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(404);
      expect((error as APIError).message).toContain('not found');
      expect(createMock).not.toHaveBeenCalled();
    });

    it('should reject a quote webhook when a user-scoped key does not own the quote', async () => {
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote({ partnerId: null, userId: 'user-other' }));

      const error = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, USER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(404);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('should reject registration when the key has no principal', async () => {
      const error = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, { partnerId: null, userId: null }).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(403);
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
      }, PARTNER_OWNER);

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.TRANSACTION_CREATED, WebhookEventType.STATUS_CHANGE],
        isActive: true,
        partnerId: 'partner-1',
        sessionId: 'session-456',
        quoteId: null,
        url: 'https://example.com/webhook',
        userId: null
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
      }, PARTNER_OWNER);

      // Verify
      expect(createMock).toHaveBeenCalledWith({
        events: [WebhookEventType.STATUS_CHANGE],
        isActive: true,
        partnerId: 'partner-1',
        sessionId: 'session-789',
        quoteId: null,
        url: 'https://example.com/webhook',
        userId: null
      });

      expect(result.events).toEqual([WebhookEventType.STATUS_CHANGE]);
    });

    it('should handle registration errors', async () => {
      // Setup mocks — the quote lookup must succeed so the rejection genuinely
      // comes from Webhook.create, not from an earlier validation step.
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote());
      createMock.mockRejectedValue(new Error('Database error'));

      // Execute and verify
      const error = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123'
      }, PARTNER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(500);
      expect(createMock).toHaveBeenCalled();
    });

    it('should reject non-HTTPS URLs', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'http://example.com/webhook',
        quoteId: 'quote-123'
      }, PARTNER_OWNER)).rejects.toBeInstanceOf(APIError);
    });

    it.each([
      'https://127.0.0.1/webhook',
      'https://10.0.0.5/webhook',
      'https://192.168.1.1/webhook',
      'https://169.254.169.254/webhook',
      'https://[::1]/webhook'
    ])('should reject private or reserved IP-literal URL %s', async (url) => {
      const error = await webhookService.registerWebhook({
        url,
        quoteId: 'quote-123'
      }, PARTNER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(400);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('should reject URLs with embedded credentials', async () => {
      const error = await webhookService.registerWebhook({
        url: 'https://user:secret@example.com/webhook',
        quoteId: 'quote-123'
      }, PARTNER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(400);
    });

    it('should reject missing URL', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        quoteId: 'quote-123'
      } as any, PARTNER_OWNER)).rejects.toBeInstanceOf(APIError);
    });

    it('should reject invalid event types', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123',
        events: ['INVALID_EVENT' as any]
      }, PARTNER_OWNER)).rejects.toBeInstanceOf(APIError);
    });

    it('should reject empty events array', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'quote-123',
        events: []
      }, PARTNER_OWNER)).rejects.toBeInstanceOf(APIError);
    });

    it('should reject when neither quoteId nor sessionId is provided', async () => {
      // Execute and verify
      await expect(webhookService.registerWebhook({
        url: 'https://example.com/webhook'
      }, PARTNER_OWNER)).rejects.toBeInstanceOf(APIError);
    });

    it('should reject when quoteId does not exist', async () => {
      // Setup mocks - quote not found
      quoteTicketFindByPkMock.mockResolvedValue(null);

      // Execute and verify — pin the 404 so a generic wrapped error can't satisfy this
      const error = await webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        quoteId: 'non-existent-quote'
      }, PARTNER_OWNER).then(
        () => { throw new Error('registerWebhook did not reject'); },
        e => e
      );
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(404);
      expect((error as APIError).message).toContain('not found');
    });
  });

  describe('deleteWebhook', () => {
    it('should delete an existing webhook owned by the caller', async () => {
      // Mock data
      const mockWebhook = {
        id: 'webhook-123',
        destroy: destroyMock
      };

      // Setup mocks
      destroyMock.mockResolvedValue(true);
      findOneMock.mockResolvedValue(mockWebhook);

      // Execute
      const result = await webhookService.deleteWebhook('webhook-123', PARTNER_OWNER);

      // Verify — the lookup itself is owner-scoped
      expect(findOneMock).toHaveBeenCalledWith({ where: { id: 'webhook-123', partnerId: 'partner-1' } });
      expect(destroyMock).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should scope deletion to the user for user-scoped keys', async () => {
      findOneMock.mockResolvedValue(null);

      await webhookService.deleteWebhook('webhook-123', USER_OWNER);

      expect(findOneMock).toHaveBeenCalledWith({ where: { id: 'webhook-123', userId: 'user-1' } });
    });

    it('should return false when webhook not found or owned by another principal', async () => {
      // Setup mocks
      findOneMock.mockResolvedValue(null);

      // Execute
      const result = await webhookService.deleteWebhook('non-existent-id', PARTNER_OWNER);

      // Verify
      expect(result).toBe(false);
      expect(destroyMock).not.toHaveBeenCalled();
    });

    it('should return false without querying when the key has no principal', async () => {
      const result = await webhookService.deleteWebhook('webhook-123', { partnerId: null, userId: null });

      expect(result).toBe(false);
      expect(findOneMock).not.toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      // Setup mocks
      findOneMock.mockRejectedValue(new Error('Database error'));

      // Execute and verify
      await expect(webhookService.deleteWebhook('webhook-123', PARTNER_OWNER))
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
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote());
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

    it('should scope matching webhooks strictly to the quote owner', async () => {
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote({ partnerId: 'partner-1', userId: 'user-1' }));
      findAllMock.mockResolvedValue([]);

      await webhookService.findWebhooksForEvent(WebhookEventType.STATUS_CHANGE, 'quote-123', 'session-456');

      const where = (findAllMock.mock.calls[0] as any)[0].where;
      const [targetOr, ownerOr] = where[Op.and];
      expect(targetOr[Op.or]).toEqual([
        { quoteId: 'quote-123' },
        { sessionId: 'session-456' },
        { quoteId: null, sessionId: null }
      ]);
      // No ownerless clause: such a row would match every quote, which is exactly the
      // cross-tenant hole a pre-ownership row could have been planted to exploit.
      expect(ownerOr[Op.or]).toEqual([
        { partnerId: 'partner-1' },
        { userId: 'user-1' }
      ]);
    });

    it('should deliver to nobody when the quote owner cannot be resolved', async () => {
      quoteTicketFindByPkMock.mockResolvedValue(null);
      findAllMock.mockResolvedValue([]);

      const result = await webhookService.findWebhooksForEvent(WebhookEventType.STATUS_CHANGE, 'quote-123');

      expect(result).toEqual([]);
      expect(findAllMock).not.toHaveBeenCalled();
    });

    it('should find webhooks for session and quote', async () => {
      // Use mock factory
      const mockWebhooks = createMockWebhookArray([
        { id: 'webhook-1', quoteId: 'quote-123', events: [WebhookEventType.STATUS_CHANGE] },
        { id: 'webhook-2', quoteId: null, sessionId: 'session-456', events: [WebhookEventType.STATUS_CHANGE] },
        { id: 'webhook-3', quoteId: null, sessionId: null, events: [WebhookEventType.STATUS_CHANGE] }
      ]);

      // Setup mocks
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote());
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
      quoteTicketFindByPkMock.mockResolvedValue(createMockQuote());
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
