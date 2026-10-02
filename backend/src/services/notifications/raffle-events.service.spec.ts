import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { RaffleEventsService, TicketCountUpdatedPayload } from './raffle-events.service';

// ---------------------------------------------------------------------------
// ioredis mock
//
// We never want real network calls.  The mock exposes the same event-emitter
// interface that the real Redis client uses so RaffleEventsService can drive
// `connect` / `error` / `message` events in tests.
// ---------------------------------------------------------------------------

class FakeRedis extends EventEmitter {
  subscribe = jest.fn().mockResolvedValue(undefined);
  quit = jest.fn().mockResolvedValue(undefined);
  disconnect = jest.fn();
}

let fakeRedisInstance: FakeRedis;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    fakeRedisInstance = new FakeRedis();
    return fakeRedisInstance;
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfig(redisUrl: string | undefined) {
  return {
    provide: ConfigService,
    useValue: {
      get: jest.fn((key: string, defaultVal?: string) =>
        key === 'REDIS_URL' ? (redisUrl ?? defaultVal ?? '') : (defaultVal ?? ''),
      ),
    },
  };
}

async function createService(redisUrl: string | undefined): Promise<RaffleEventsService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [RaffleEventsService, buildConfig(redisUrl)],
  }).compile();

  const service = module.get<RaffleEventsService>(RaffleEventsService);
  service.onModuleInit();
  return service;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RaffleEventsService', () => {
  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // Initialisation
  // =========================================================================

  describe('onModuleInit — Redis configuration', () => {
    it('does not create a Redis connection when REDIS_URL is absent', async () => {
      const service = await createService(undefined);

      expect(service.isEnabled()).toBe(false);
    });

    it('does not create a Redis connection when REDIS_URL is empty string', async () => {
      const service = await createService('');

      expect(service.isEnabled()).toBe(false);
    });

    it('does not create a Redis connection when REDIS_URL is whitespace only', async () => {
      const service = await createService('   ');

      expect(service.isEnabled()).toBe(false);
    });

    it('creates a Redis subscriber when REDIS_URL is provided', async () => {
      const service = await createService('redis://localhost:6379');

      expect(service.isEnabled()).toBe(true);
      expect(fakeRedisInstance.subscribe).toHaveBeenCalledWith('raffle:ticket_count_updated');
    });

    it('subscribes to the correct Redis channel', async () => {
      await createService('redis://localhost:6379');

      expect(fakeRedisInstance.subscribe).toHaveBeenCalledWith('raffle:ticket_count_updated');
    });

    it('sets maxListeners to 0 so it can handle unlimited SSE connections', async () => {
      const service = await createService(undefined);
      // Access private emitter via casting to check the limit
      const emitter = (service as unknown as { emitter: EventEmitter }).emitter;
      expect(emitter.getMaxListeners()).toBe(0);
    });
  });

  // =========================================================================
  // onTicketCountUpdated — listener registration and fan-out
  // =========================================================================

  describe('onTicketCountUpdated', () => {
    it('calls the listener when a valid message arrives on the subscribed raffle', async () => {
      await createService('redis://localhost:6379');

      const listener = jest.fn();
      const service_instance = await createService('redis://localhost:6379');
      service_instance.onTicketCountUpdated(7, listener);

      const payload: TicketCountUpdatedPayload = {
        raffleId: 7,
        ticketsSold: 42,
        updatedAt: Date.now(),
      };

      // Simulate Redis delivering a message
      fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', JSON.stringify(payload));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(payload);
    });

    it('does not call the listener for a different raffleId', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const listener = jest.fn();
      service_instance.onTicketCountUpdated(7, listener);

      fakeRedisInstance.emit(
        'message',
        'raffle:ticket_count_updated',
        JSON.stringify({ raffleId: 99, ticketsSold: 1, updatedAt: Date.now() }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('fans out to multiple listeners on the same raffleId', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const l1 = jest.fn();
      const l2 = jest.fn();
      const l3 = jest.fn();
      service_instance.onTicketCountUpdated(5, l1);
      service_instance.onTicketCountUpdated(5, l2);
      service_instance.onTicketCountUpdated(5, l3);

      const payload: TicketCountUpdatedPayload = {
        raffleId: 5,
        ticketsSold: 10,
        updatedAt: Date.now(),
      };

      fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', JSON.stringify(payload));

      expect(l1).toHaveBeenCalledWith(payload);
      expect(l2).toHaveBeenCalledWith(payload);
      expect(l3).toHaveBeenCalledWith(payload);
    });

    it('returns an unsubscribe function that stops future deliveries', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const listener = jest.fn();
      const unsubscribe = service_instance.onTicketCountUpdated(3, listener);

      const payload: TicketCountUpdatedPayload = {
        raffleId: 3,
        ticketsSold: 5,
        updatedAt: Date.now(),
      };

      // First delivery — should arrive
      fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', JSON.stringify(payload));
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second delivery — must be suppressed
      fakeRedisInstance.emit(
        'message',
        'raffle:ticket_count_updated',
        JSON.stringify({ ...payload, ticketsSold: 6 }),
      );
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // SSE payload shape
  //
  // The client's useEventSource hook consumes messages from this service.
  // Assert the exact shape of TicketCountUpdatedPayload so API contracts
  // are documented in test form.
  // =========================================================================

  describe('TicketCountUpdatedPayload shape (SSE contract)', () => {
    it('delivers a payload with raffleId (number), ticketsSold (number), updatedAt (number)', async () => {
      const service_instance = await createService('redis://localhost:6379');

      let received: TicketCountUpdatedPayload | undefined;
      service_instance.onTicketCountUpdated(1, (p) => {
        received = p;
      });

      const now = Date.now();
      fakeRedisInstance.emit(
        'message',
        'raffle:ticket_count_updated',
        JSON.stringify({ raffleId: 1, ticketsSold: 99, updatedAt: now }),
      );

      expect(received).toBeDefined();
      expect(typeof received!.raffleId).toBe('number');
      expect(typeof received!.ticketsSold).toBe('number');
      expect(typeof received!.updatedAt).toBe('number');
      expect(received!.raffleId).toBe(1);
      expect(received!.ticketsSold).toBe(99);
      expect(received!.updatedAt).toBe(now);
    });
  });

  // =========================================================================
  // Message parsing robustness
  // =========================================================================

  describe('message parsing', () => {
    it('ignores messages on unknown channels', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const listener = jest.fn();
      service_instance.onTicketCountUpdated(1, listener);

      fakeRedisInstance.emit(
        'message',
        'some:other:channel',
        JSON.stringify({ raffleId: 1, ticketsSold: 1, updatedAt: Date.now() }),
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not throw when message JSON is malformed', async () => {
      await createService('redis://localhost:6379');

      // Should not throw — the service logs a warning and continues.
      expect(() =>
        fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', 'not-valid-json{{{'),
      ).not.toThrow();
    });

    it('does not deliver anything when message JSON is malformed', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const listener = jest.fn();
      service_instance.onTicketCountUpdated(1, listener);

      fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', '{invalid}');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Redis subscriber error handling (push provider outage analogue)
  //
  // An error on the Redis subscriber must not crash the process or affect
  // in-flight SSE connections.
  // =========================================================================

  describe('Redis subscriber error resilience', () => {
    it('does not throw when the subscriber emits an error event', async () => {
      await createService('redis://localhost:6379');

      expect(() => fakeRedisInstance.emit('error', new Error('ECONNRESET'))).not.toThrow();
    });

    it('keeps existing listeners registered after a subscriber error', async () => {
      const service_instance = await createService('redis://localhost:6379');

      const listener = jest.fn();
      service_instance.onTicketCountUpdated(2, listener);

      // Simulate a transient Redis error
      fakeRedisInstance.emit('error', new Error('connection lost'));

      // Service should still fan out subsequent messages
      const payload: TicketCountUpdatedPayload = {
        raffleId: 2,
        ticketsSold: 3,
        updatedAt: Date.now(),
      };

      fakeRedisInstance.emit('message', 'raffle:ticket_count_updated', JSON.stringify(payload));

      expect(listener).toHaveBeenCalledWith(payload);
    });
  });

  // =========================================================================
  // onModuleDestroy
  // =========================================================================

  describe('onModuleDestroy', () => {
    it('calls quit() on the subscriber when Redis is configured', async () => {
      const service_instance = await createService('redis://localhost:6379');

      await service_instance.onModuleDestroy();

      expect(fakeRedisInstance.quit).toHaveBeenCalled();
    });

    it('sets the internal subscriber to null after destroy (isEnabled → false)', async () => {
      const service_instance = await createService('redis://localhost:6379');
      expect(service_instance.isEnabled()).toBe(true);

      await service_instance.onModuleDestroy();

      expect(service_instance.isEnabled()).toBe(false);
    });

    it('falls back to disconnect() when quit() rejects', async () => {
      const service_instance = await createService('redis://localhost:6379');
      fakeRedisInstance.quit.mockRejectedValueOnce(new Error('quit failed'));

      await service_instance.onModuleDestroy();

      expect(fakeRedisInstance.disconnect).toHaveBeenCalled();
    });

    it('is a no-op when Redis was never configured', async () => {
      const service_instance = await createService(undefined);

      // Should not throw
      await expect(service_instance.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // isEnabled
  // =========================================================================

  describe('isEnabled', () => {
    it('returns false before Redis connection is established', async () => {
      const service = await createService(undefined);
      expect(service.isEnabled()).toBe(false);
    });

    it('returns true when Redis is connected', async () => {
      const service = await createService('redis://localhost:6379');
      expect(service.isEnabled()).toBe(true);
    });
  });
});
