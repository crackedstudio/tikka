import {
  ArgumentMetadata,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';
import { WebhookService } from '../../../services/webhooks/webhook.service';
import { WebhooksController } from './webhooks.controller';
import { CreateWebhookSchema, UpdateWebhookSchema } from './webhooks.schema';

const OWNER = 'GABC123';
const WEBHOOK_ID = 'webhook-123';

const bodyMetadata: ArgumentMetadata = {
  type: 'body',
  metatype: undefined,
  data: undefined,
};

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let service: jest.Mocked<
    Pick<
      WebhookService,
      | 'createWebhook'
      | 'getWebhooksByOwner'
      | 'getWebhook'
      | 'updateWebhook'
      | 'deleteWebhook'
      | 'getDeliveries'
      | 'getDeadLetters'
    >
  >;

  beforeEach(async () => {
    service = {
      createWebhook: jest.fn(),
      getWebhooksByOwner: jest.fn(),
      getWebhook: jest.fn(),
      updateWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      getDeliveries: jest.fn(),
      getDeadLetters: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        WebhookService,
        | 'createWebhook'
        | 'getWebhooksByOwner'
        | 'getWebhook'
        | 'updateWebhook'
        | 'deleteWebhook'
        | 'getDeliveries'
        | 'getDeadLetters'
      >
    >;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [{ provide: WebhookService, useValue: service }],
    }).compile();

    controller = module.get(WebhooksController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a webhook for the authenticated owner', async () => {
    const payload = { targetUrl: 'https://example.com/hook', events: ['RaffleFinalized'] };
    const created = { id: WEBHOOK_ID, ...payload };
    service.createWebhook.mockResolvedValue(created as any);

    await expect(controller.createWebhook(OWNER, payload)).resolves.toEqual(created);
    expect(service.createWebhook).toHaveBeenCalledWith({
      ownerAddress: OWNER,
      targetUrl: payload.targetUrl,
      events: payload.events,
    });
  });

  it('accepts a valid create payload through its Zod pipe', () => {
    const Pipe = createZodPipe(CreateWebhookSchema);
    const pipe = new Pipe();

    expect(
      pipe.transform(
        { targetUrl: 'https://example.com/hook', events: ['RaffleCreated'] },
        bodyMetadata,
      ),
    ).toEqual({ targetUrl: 'https://example.com/hook', events: ['RaffleCreated'] });
  });

  it.each([
    [{ targetUrl: 'not-a-url', events: ['RaffleCreated'] }],
    [{ targetUrl: 'https://example.com/hook', events: [] }],
  ])('rejects an invalid create payload', (payload) => {
    const Pipe = createZodPipe(CreateWebhookSchema);
    const pipe = new Pipe();

    expect(() => pipe.transform(payload, bodyMetadata)).toThrow(BadRequestException);
    expect(service.createWebhook).not.toHaveBeenCalled();
  });

  it('rejects an invalid update payload through its Zod pipe', () => {
    const Pipe = createZodPipe(UpdateWebhookSchema);
    const pipe = new Pipe();

    expect(() => pipe.transform({ targetUrl: 'invalid', events: [] }, bodyMetadata)).toThrow(
      BadRequestException,
    );
  });

  it('lists only the authenticated owner webhooks', async () => {
    const webhooks = [{ id: WEBHOOK_ID }];
    service.getWebhooksByOwner.mockResolvedValue(webhooks as any);

    await expect(controller.getWebhooks(OWNER)).resolves.toEqual(webhooks);
    expect(service.getWebhooksByOwner).toHaveBeenCalledWith(OWNER);
  });

  it('gets a webhook using the owner as part of the lookup', async () => {
    const webhook = { id: WEBHOOK_ID };
    service.getWebhook.mockResolvedValue(webhook as any);

    await expect(controller.getWebhook(OWNER, WEBHOOK_ID)).resolves.toEqual(webhook);
    expect(service.getWebhook).toHaveBeenCalledWith(WEBHOOK_ID, OWNER);
  });

  it('updates a webhook for the authenticated owner', async () => {
    const payload = { targetUrl: 'https://new.example.com/hook', isActive: false };
    const updated = { id: WEBHOOK_ID, ...payload };
    service.updateWebhook.mockResolvedValue(updated as any);

    await expect(controller.updateWebhook(OWNER, WEBHOOK_ID, payload)).resolves.toEqual(updated);
    expect(service.updateWebhook).toHaveBeenCalledWith(WEBHOOK_ID, OWNER, payload);
  });

  it('deletes a webhook and reports success', async () => {
    service.deleteWebhook.mockResolvedValue(undefined);

    await expect(controller.deleteWebhook(OWNER, WEBHOOK_ID)).resolves.toEqual({ success: true });
    expect(service.deleteWebhook).toHaveBeenCalledWith(WEBHOOK_ID, OWNER);
  });

  it('returns delivery logs for the owner', async () => {
    const deliveries = [{ id: 'delivery-1', success: true }];
    service.getDeliveries.mockResolvedValue(deliveries as any);

    await expect(controller.getDeliveries(OWNER, WEBHOOK_ID)).resolves.toEqual(deliveries);
    expect(service.getDeliveries).toHaveBeenCalledWith(WEBHOOK_ID, OWNER);
  });

  it('returns dead-letter records for the owner', async () => {
    const deadLetters = [{ id: 'dead-letter-1' }];
    service.getDeadLetters.mockResolvedValue(deadLetters as any);

    await expect(controller.getDeadLetters(OWNER, WEBHOOK_ID)).resolves.toEqual(deadLetters);
    expect(service.getDeadLetters).toHaveBeenCalledWith(WEBHOOK_ID, OWNER);
  });

  it('propagates duplicate-subscription errors', async () => {
    service.createWebhook.mockRejectedValue(new ConflictException('Webhook already exists'));

    await expect(
      controller.createWebhook(OWNER, {
        targetUrl: 'https://example.com/hook',
        events: ['RaffleCreated'],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('propagates not-found errors for inaccessible webhooks', async () => {
    service.getWebhook.mockRejectedValue(new NotFoundException('Webhook not found'));

    await expect(controller.getWebhook(OWNER, WEBHOOK_ID)).rejects.toThrow(NotFoundException);
  });

  it('does not report deletion success when the service fails', async () => {
    service.deleteWebhook.mockRejectedValue(new Error('Database unavailable'));

    await expect(controller.deleteWebhook(OWNER, WEBHOOK_ID)).rejects.toThrow(
      'Database unavailable',
    );
  });
});
