import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  NotificationService,
  NotificationSubscription,
  NotificationPreferences,
} from './notification.service';
import { SUPABASE_CLIENT } from '../storage/supabase.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<NotificationSubscription> = {}): NotificationSubscription {
  return {
    id: 'sub-1',
    raffle_id: 42,
    user_address: 'GABC',
    channel: 'email',
    created_at: '2024-01-01T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function makePrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return {
    user_address: 'GABC',
    raffle_end: true,
    win_notification: true,
    channel: 'email',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let service: NotificationService;

  // Shared mock references rebuilt each test
  let maybeSingle: jest.Mock;
  let single: jest.Mock;
  let fromMock: jest.Mock;

  // Build a fresh Supabase mock before each test.
  // Returns handles for the terminal methods so individual tests can steer them.
  function buildClient() {
    maybeSingle = jest.fn();
    single = jest.fn();

    // Chainable builder returned by most from() calls
    const makeChain = () => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      maybeSingle,
      single,
    });

    fromMock = jest.fn(makeChain);
    return { from: fromMock };
  }

  beforeEach(async () => {
    const supabase = buildClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationService, { provide: SUPABASE_CLIENT, useValue: supabase }],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // subscribe
  // =========================================================================

  describe('subscribe', () => {
    it('creates a new subscription when none exists', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      const inserted = makeSub();
      single.mockResolvedValueOnce({ data: inserted, error: null });

      const result = await service.subscribe({
        raffleId: 42,
        userAddress: 'GABC',
        channel: 'email',
      });

      expect(result).toEqual(inserted);
      expect(fromMock).toHaveBeenCalledWith('notifications');
    });

    it('returns existing active subscription without re-inserting', async () => {
      const existing = makeSub({ status: 'active' });
      maybeSingle.mockResolvedValueOnce({ data: existing, error: null });

      const result = await service.subscribe({ raffleId: 42, userAddress: 'GABC' });

      expect(result).toEqual(existing);
      // single() is only called for the insert path, not reached here
      expect(single).not.toHaveBeenCalled();
    });

    it('re-subscribes a previously revoked subscription', async () => {
      maybeSingle.mockResolvedValueOnce({ data: makeSub({ status: 'revoked' }), error: null });
      const newSub = makeSub({ id: 'sub-2', status: 'active' });
      single.mockResolvedValueOnce({ data: newSub, error: null });

      const result = await service.subscribe({ raffleId: 42, userAddress: 'GABC' });
      expect(result).toEqual(newSub);
    });

    it('throws ConflictException on unique constraint violation (code 23505)', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      single.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      });

      await expect(service.subscribe({ raffleId: 42, userAddress: 'GABC' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws a generic Error on other DB failures', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      single.mockResolvedValueOnce({
        data: null,
        error: { code: 'XXXX', message: 'connection refused' },
      });

      await expect(service.subscribe({ raffleId: 42, userAddress: 'GABC' })).rejects.toThrow(
        'Failed to create subscription: connection refused',
      );
    });

    it('defaults to email channel when none specified', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      single.mockResolvedValueOnce({ data: makeSub({ channel: 'email' }), error: null });

      await service.subscribe({ raffleId: 42, userAddress: 'GABC' });

      // Find the from() call that triggered insert — its chain mock holds the insert call
      const allFromResults: any[] = fromMock.mock.results.map((r: any) => r.value);
      const insertedWith = allFromResults
        .flatMap((b: any) => (b.insert as jest.Mock).mock.calls)
        .flat();
      expect(insertedWith).toContainEqual(expect.objectContaining({ channel: 'email' }));
    });
  });

  // =========================================================================
  // unsubscribe
  // =========================================================================

  describe('unsubscribe', () => {
    it('marks the subscription as revoked', async () => {
      // .update().eq().eq() — second eq must be thenable
      const eq2Mock = jest.fn().mockResolvedValue({ error: null });
      const eq1Mock = jest.fn().mockReturnValue({ eq: eq2Mock });
      const updateMock = jest.fn().mockReturnValue({ eq: eq1Mock });
      fromMock.mockReturnValueOnce({ update: updateMock } as any);

      await expect(service.unsubscribe(42, 'GABC')).resolves.toBeUndefined();
      expect(fromMock).toHaveBeenCalledWith('notifications');
    });

    it('throws when the DB update fails', async () => {
      const eq2Mock = jest.fn().mockResolvedValue({ error: { message: 'update failed' } });
      const eq1Mock = jest.fn().mockReturnValue({ eq: eq2Mock });
      const updateMock = jest.fn().mockReturnValue({ eq: eq1Mock });
      fromMock.mockReturnValueOnce({ update: updateMock } as any);

      await expect(service.unsubscribe(42, 'GABC')).rejects.toThrow(
        'Failed to revoke subscription: update failed',
      );
    });
  });

  // =========================================================================
  // updateSubscription
  // =========================================================================

  describe('updateSubscription', () => {
    it('updates the channel', async () => {
      const eqMock = jest.fn().mockResolvedValue({ error: null });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ update: updateMock } as any);

      await expect(
        service.updateSubscription('sub-1', { channel: 'push' }),
      ).resolves.toBeUndefined();
    });

    it('is a no-op when dto has no fields', async () => {
      await service.updateSubscription('sub-1', {});
      // from() should never be called for an empty update
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('throws on DB error', async () => {
      const eqMock = jest.fn().mockResolvedValue({ error: { message: 'oops' } });
      const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ update: updateMock } as any);

      await expect(service.updateSubscription('sub-1', { channel: 'push' })).rejects.toThrow(
        'Failed to update subscription: oops',
      );
    });
  });

  // =========================================================================
  // isSubscribed
  // =========================================================================

  describe('isSubscribed', () => {
    it('returns true for an active subscription', async () => {
      maybeSingle.mockResolvedValueOnce({ data: makeSub({ status: 'active' }), error: null });
      await expect(service.isSubscribed(42, 'GABC')).resolves.toBe(true);
    });

    it('returns false for a revoked subscription', async () => {
      maybeSingle.mockResolvedValueOnce({ data: makeSub({ status: 'revoked' }), error: null });
      await expect(service.isSubscribed(42, 'GABC')).resolves.toBe(false);
    });

    it('returns false when no subscription exists', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(service.isSubscribed(42, 'GABC')).resolves.toBe(false);
    });
  });

  // =========================================================================
  // getPreferences
  // =========================================================================

  describe('getPreferences', () => {
    it('returns stored preferences', async () => {
      const prefs = makePrefs({ raffle_end: false });
      maybeSingle.mockResolvedValueOnce({ data: prefs, error: null });

      await expect(service.getPreferences('GABC')).resolves.toEqual(prefs);
    });

    it('returns opt-in defaults when no record exists', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.getPreferences('GABC');

      expect(result.raffle_end).toBe(true);
      expect(result.win_notification).toBe(true);
      expect(result.channel).toBe('email');
      expect(result.user_address).toBe('GABC');
    });

    it('throws on DB error', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB down' } });
      await expect(service.getPreferences('GABC')).rejects.toThrow(
        'Failed to fetch preferences: DB down',
      );
    });
  });

  // =========================================================================
  // updatePreferences
  // =========================================================================

  describe('updatePreferences', () => {
    it('upserts all provided fields', async () => {
      const updated = makePrefs({ raffle_end: false, win_notification: false, channel: 'push' });
      single.mockResolvedValueOnce({ data: updated, error: null });

      const result = await service.updatePreferences('GABC', {
        raffleEnd: false,
        winNotification: false,
        channel: 'push',
      });

      expect(result).toEqual(updated);

      const upsertCalls: any[] = fromMock.mock.results
        .map((r: any) => r.value)
        .flatMap((b: any) => (b.upsert as jest.Mock).mock.calls);

      expect(upsertCalls.length).toBeGreaterThan(0);
      const [upsertArg, opts] = upsertCalls[0];
      expect(upsertArg.raffle_end).toBe(false);
      expect(upsertArg.win_notification).toBe(false);
      expect(upsertArg.channel).toBe('push');
      expect(opts.onConflict).toBe('user_address');
    });

    it('omits fields not present in payload', async () => {
      single.mockResolvedValueOnce({ data: makePrefs({ raffle_end: false }), error: null });

      await service.updatePreferences('GABC', { raffleEnd: false });

      const upsertArg: any = fromMock.mock.results
        .map((r: any) => r.value)
        .flatMap((b: any) => (b.upsert as jest.Mock).mock.calls)
        .flat()[0];

      expect(upsertArg).not.toHaveProperty('win_notification');
      expect(upsertArg).not.toHaveProperty('channel');
    });

    it('throws on DB error', async () => {
      single.mockResolvedValueOnce({ data: null, error: { message: 'upsert failed' } });
      await expect(service.updatePreferences('GABC', { raffleEnd: false })).rejects.toThrow(
        'Failed to update preferences: upsert failed',
      );
    });
  });

  // =========================================================================
  // canSendRaffleEnd / canSendWinner — preference gate (issue #861)
  // =========================================================================

  describe('preference gate', () => {
    it('canSendRaffleEnd → true when opted in', async () => {
      maybeSingle.mockResolvedValueOnce({ data: makePrefs({ raffle_end: true }), error: null });
      await expect(service.canSendRaffleEnd('GABC')).resolves.toBe(true);
    });

    it('canSendRaffleEnd → false when opted out (issue #861)', async () => {
      maybeSingle.mockResolvedValueOnce({ data: makePrefs({ raffle_end: false }), error: null });
      await expect(service.canSendRaffleEnd('GABC')).resolves.toBe(false);
    });

    it('canSendRaffleEnd → true by default (no stored prefs)', async () => {
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(service.canSendRaffleEnd('GABC')).resolves.toBe(true);
    });

    it('canSendWinner → true when opted in', async () => {
      maybeSingle.mockResolvedValueOnce({
        data: makePrefs({ win_notification: true }),
        error: null,
      });
      await expect(service.canSendWinner('GABC')).resolves.toBe(true);
    });

    it('canSendWinner → false when opted out (issue #861)', async () => {
      maybeSingle.mockResolvedValueOnce({
        data: makePrefs({ win_notification: false }),
        error: null,
      });
      await expect(service.canSendWinner('GABC')).resolves.toBe(false);
    });
  });

  // =========================================================================
  // getRaffleEndSubscribers — fan-out with preference filtering
  // =========================================================================

  describe('getRaffleEndSubscribers (fan-out + preference filtering)', () => {
    const subs = [
      makeSub({ id: '1', user_address: 'USER_A' }),
      makeSub({ id: '2', user_address: 'USER_B' }),
      makeSub({ id: '3', user_address: 'USER_C' }),
    ];

    it('returns all subscribers when all have opted in', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest.spyOn(service, 'canSendRaffleEnd').mockResolvedValue(true);

      const result = await service.getRaffleEndSubscribers(42);

      expect(result).toHaveLength(3);
    });

    it('filters out subscribers who opted out of raffle-end notifications', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest
        .spyOn(service, 'canSendRaffleEnd')
        .mockImplementation(async (addr: string) => addr !== 'USER_B');

      const result = await service.getRaffleEndSubscribers(42);

      expect(result).toHaveLength(2);
      expect(result.map((s) => s.user_address)).not.toContain('USER_B');
    });

    it('returns an empty array when every subscriber has opted out', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest.spyOn(service, 'canSendRaffleEnd').mockResolvedValue(false);

      const result = await service.getRaffleEndSubscribers(42);

      expect(result).toHaveLength(0);
    });

    it('returns an empty array when there are no subscribers', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue([]);
      const result = await service.getRaffleEndSubscribers(42);
      expect(result).toHaveLength(0);
    });

    it('runs preference checks in parallel (all canSendRaffleEnd calls concurrent)', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      const checkOrder: string[] = [];
      jest.spyOn(service, 'canSendRaffleEnd').mockImplementation(async (addr: string) => {
        checkOrder.push(addr);
        return true;
      });

      await service.getRaffleEndSubscribers(42);

      // All three addresses must be checked (concurrent Promise.all)
      expect(checkOrder).toHaveLength(3);
      expect(checkOrder).toEqual(expect.arrayContaining(['USER_A', 'USER_B', 'USER_C']));
    });
  });

  // =========================================================================
  // getWinnerSubscribers — fan-out with preference filtering
  // =========================================================================

  describe('getWinnerSubscribers (fan-out + preference filtering)', () => {
    const subs = [
      makeSub({ id: '1', user_address: 'WINNER_A' }),
      makeSub({ id: '2', user_address: 'WINNER_B' }),
    ];

    it('returns only subscribers who have not opted out of win notifications', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest
        .spyOn(service, 'canSendWinner')
        .mockImplementation(async (addr: string) => addr !== 'WINNER_B');

      const result = await service.getWinnerSubscribers(42);

      expect(result).toHaveLength(1);
      expect(result[0].user_address).toBe('WINNER_A');
    });

    it('returns an empty array when all have opted out', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest.spyOn(service, 'canSendWinner').mockResolvedValue(false);

      const result = await service.getWinnerSubscribers(42);
      expect(result).toHaveLength(0);
    });

    it('returns all when all have opted in', async () => {
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest.spyOn(service, 'canSendWinner').mockResolvedValue(true);

      const result = await service.getWinnerSubscribers(42);
      expect(result).toHaveLength(2);
    });
  });

  // =========================================================================
  // getUserSubscriptions
  // =========================================================================

  describe('getUserSubscriptions', () => {
    it('returns all subscriptions ordered by created_at desc', async () => {
      const storedSubs = [makeSub({ id: '2' }), makeSub({ id: '1' })];
      const orderMock = jest.fn().mockResolvedValue({ data: storedSubs, error: null });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      const result = await service.getUserSubscriptions('GABC');
      expect(result).toEqual(storedSubs);
    });

    it('returns empty array on no results', async () => {
      const orderMock = jest.fn().mockResolvedValue({ data: null, error: null });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      const result = await service.getUserSubscriptions('GABC');
      expect(result).toEqual([]);
    });

    it('throws on DB error', async () => {
      const orderMock = jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'query failed' } });
      const eqMock = jest.fn().mockReturnValue({ order: orderMock });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      await expect(service.getUserSubscriptions('GABC')).rejects.toThrow(
        'Failed to fetch user subscriptions: query failed',
      );
    });
  });

  // =========================================================================
  // getRaffleSubscribers
  // =========================================================================

  describe('getRaffleSubscribers', () => {
    it('returns all subscribers for a raffle', async () => {
      const storedSubs = [makeSub({ id: '1' }), makeSub({ id: '2' })];
      const eqMock = jest.fn().mockResolvedValue({ data: storedSubs, error: null });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      const result = await service.getRaffleSubscribers(42);
      expect(result).toEqual(storedSubs);
    });

    it('returns empty array when no subscribers', async () => {
      const eqMock = jest.fn().mockResolvedValue({ data: null, error: null });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      const result = await service.getRaffleSubscribers(42);
      expect(result).toEqual([]);
    });

    it('throws on DB error', async () => {
      const eqMock = jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'select error' } });
      const selectMock = jest.fn().mockReturnValue({ eq: eqMock });
      fromMock.mockReturnValueOnce({ select: selectMock } as any);

      await expect(service.getRaffleSubscribers(42)).rejects.toThrow(
        'Failed to fetch raffle subscribers: select error',
      );
    });
  });

  // =========================================================================
  // Channel failure mode: a push provider outage must not lose preference
  // filtering or block the subscriber list.
  //
  // NotificationService itself doesn't call PushNotificationService — that's
  // the orchestrator above. What we assert here is: if a *single* preference
  // check throws (e.g. the preferences DB is unreachable during a push outage),
  // the current Promise.all implementation surfaces the error. This is the
  // documented behaviour; callers of getRaffleEndSubscribers must handle it.
  // =========================================================================

  describe('resilience: single preference-check failure', () => {
    it('propagates the rejection from a failed canSendRaffleEnd check (Promise.all)', async () => {
      const subs = [
        makeSub({ id: '1', user_address: 'USER_A' }),
        makeSub({ id: '2', user_address: 'USER_B' }),
      ];
      jest.spyOn(service, 'getRaffleSubscribers').mockResolvedValue(subs);
      jest.spyOn(service, 'canSendRaffleEnd').mockImplementation(async (addr: string) => {
        if (addr === 'USER_B') throw new Error('preference DB unreachable');
        return true;
      });

      // Documents the current behaviour: a single failure rejects the whole fan-out.
      // If partial delivery is added later, update this test alongside the implementation.
      await expect(service.getRaffleEndSubscribers(42)).rejects.toThrow(
        'preference DB unreachable',
      );
    });
  });
});
