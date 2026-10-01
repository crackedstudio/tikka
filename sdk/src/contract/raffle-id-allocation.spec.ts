/**
 * raffle-id-allocation.spec.ts
 *
 * Asserts the documented raffle ID allocation guarantees from
 * `docs/contracts/INTEGRATION_BOUNDARY.md` ("Raffle ID Allocation") against
 * the reference model in `raffle-id-allocation.ts`.
 *
 * Coverage:
 *   - allocation is monotonic and consecutive from FIRST_RAFFLE_ID
 *   - IDs are NEVER reused after a terminal transition (CANCELLED / FINALIZED)
 *   - terminal transitions retire an ID rather than release it
 *   - get_active_raffle_ids drops terminated IDs while get_all_raffle_ids keeps them
 *   - exhaustion of the u32 space raises the named RaffleIdExhausted error and
 *     does not wrap
 *   - the guarantee survives contract upgrades (snapshot → restore → continue)
 *   - the named error round-trips through the SDK's contract error mapping
 *
 * Issue: #1700
 */

import {
  FIRST_RAFFLE_ID,
  MAX_RAFFLE_ID,
  RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE,
  RAFFLE_ID_SPACE_SIZE,
  RaffleIdAllocator,
  TERMINAL_RAFFLE_STATUSES,
  allocateRaffleId,
  isTerminalRaffleStatus,
  nextRaffleId,
} from './raffle-id-allocation';
import {
  ContractErrorType,
  RaffleEndedError,
  RaffleIdExhaustedError,
  TikkaSdkError,
  TikkaSdkErrorCode,
  toTypedContractError,
  toTypedSdkError,
} from '../utils/errors';
import { RaffleStatus } from '@tikka/types';

// ─── Basics ───────────────────────────────────────────────────────────────────

describe('raffle ID space', () => {
  it('starts at 1 and is bounded by u32::MAX', () => {
    expect(FIRST_RAFFLE_ID).toBe(1);
    expect(MAX_RAFFLE_ID).toBe(0xffff_ffff);
    expect(RAFFLE_ID_SPACE_SIZE).toBe(MAX_RAFFLE_ID);
  });

  it('treats FINALIZED and CANCELLED as the only terminal states', () => {
    expect(TERMINAL_RAFFLE_STATUSES).toEqual([RaffleStatus.FINALIZED, RaffleStatus.CANCELLED]);
    expect(isTerminalRaffleStatus(RaffleStatus.FINALIZED)).toBe(true);
    expect(isTerminalRaffleStatus(RaffleStatus.CANCELLED)).toBe(true);
    expect(isTerminalRaffleStatus(RaffleStatus.OPEN)).toBe(false);
    expect(isTerminalRaffleStatus(RaffleStatus.DRAWING)).toBe(false);
  });
});

describe('allocateRaffleId', () => {
  it('issues the ID following the counter', () => {
    expect(allocateRaffleId({ lastIssuedId: 0 })).toBe(FIRST_RAFFLE_ID);
    expect(allocateRaffleId({ lastIssuedId: 41 })).toBe(42);
  });

  it('returns null from nextRaffleId once the space is spent', () => {
    expect(nextRaffleId(MAX_RAFFLE_ID - 1)).toBe(MAX_RAFFLE_ID);
    expect(nextRaffleId(MAX_RAFFLE_ID)).toBeNull();
  });

  it('throws the named exhaustion error instead of wrapping at u32::MAX', () => {
    expect(() => allocateRaffleId({ lastIssuedId: MAX_RAFFLE_ID })).toThrow(RaffleIdExhaustedError);
    try {
      allocateRaffleId({ lastIssuedId: MAX_RAFFLE_ID });
      throw new Error('expected allocateRaffleId to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RaffleIdExhaustedError);
      expect((err as TikkaSdkError).code).toBe(TikkaSdkErrorCode.RaffleIdExhausted);
      expect((err as TikkaSdkError).message).toContain('never reused');
    }
  });
});

// ─── Monotonic allocation ─────────────────────────────────────────────────────

describe('RaffleIdAllocator — allocation', () => {
  it('issues consecutive IDs starting at 1', () => {
    const storage = new RaffleIdAllocator();
    expect([1, 2, 3, 4, 5].map(() => storage.createRaffle())).toEqual([1, 2, 3, 4, 5]);
  });

  it('exposes the next ID without consuming it', () => {
    const storage = new RaffleIdAllocator();
    expect(storage.peekNextRaffleId()).toBe(1);
    expect(storage.createRaffle()).toBe(1);
    expect(storage.peekNextRaffleId()).toBe(2);
    expect(storage.peekLastIssuedId()).toBe(1);
  });

  it('never repeats an ID across many allocations', () => {
    const storage = new RaffleIdAllocator();
    const issued = Array.from({ length: 500 }, () => storage.createRaffle());
    expect(new Set(issued).size).toBe(issued.length);
    expect(storage.allRaffleIds()).toEqual(issued);
  });
});

// ─── The core guarantee: no reuse after termination ───────────────────────────

describe('RaffleIdAllocator — IDs are never reused after termination', () => {
  it('does not reissue a CANCELLED raffle ID', () => {
    const storage = new RaffleIdAllocator();
    const cancelled = storage.createRaffle();
    storage.cancelRaffle(cancelled);
    expect(storage.statusOf(cancelled)).toBe(RaffleStatus.CANCELLED);

    const later = storage.createRaffle();
    expect(later).toBeGreaterThan(cancelled);
    // Both the cancelled ID and the new one remain distinct reservations.
    expect(storage.allRaffleIds()).toEqual([cancelled, later]);
    expect(storage.activeRaffleIds()).toEqual([later]);
  });

  it('does not reissue a FINALIZED raffle ID', () => {
    const storage = new RaffleIdAllocator();
    const a = storage.createRaffle();
    storage.setStatus(a, RaffleStatus.DRAWING);
    storage.finalizeRaffle(a);
    expect(storage.statusOf(a)).toBe(RaffleStatus.FINALIZED);

    const b = storage.createRaffle();
    expect(b).toBeGreaterThan(a);
  });

  it('retires terminated IDs rather than releasing them for reuse', () => {
    const storage = new RaffleIdAllocator();
    const terminated = [storage.createRaffle(), storage.createRaffle(), storage.createRaffle()];
    storage.cancelRaffle(terminated[0]);
    storage.setStatus(terminated[2], RaffleStatus.DRAWING);
    storage.finalizeRaffle(terminated[2]);

    // Terminated IDs remain reserved: allRaffleIds still lists them, and the
    // active list drops them so they can never be mistaken for live raffles.
    expect(storage.allRaffleIds()).toEqual(terminated);
    expect(storage.activeRaffleIds()).toEqual([terminated[1]]);

    // The next allocation continues past every terminated ID.
    const next = storage.createRaffle();
    expect(next).toBeGreaterThan(Math.max(...terminated));
  });

  it('issues only strictly increasing IDs when terminations interleave with allocations', () => {
    const storage = new RaffleIdAllocator();
    const issued: number[] = [];
    const terminated: number[] = [];

    for (let i = 0; i < 200; i++) {
      const id = storage.createRaffle();
      issued.push(id);

      // Terminate on a rotating basis, alternating the two terminal states and
      // leaving some raffles live.
      if (i % 3 === 0) {
        storage.cancelRaffle(id);
        terminated.push(id);
      } else if (i % 3 === 1) {
        storage.setStatus(id, RaffleStatus.DRAWING);
        storage.finalizeRaffle(id);
        terminated.push(id);
      }
    }

    // Strictly increasing: every ID is greater than the one before it, so no
    // terminated ID can ever reappear.
    for (let i = 1; i < issued.length; i++) {
      expect(issued[i]).toBeGreaterThan(issued[i - 1]);
    }

    // No ID was issued twice, and every terminated ID is still a distinct
    // reservation in the full history.
    expect(new Set(issued).size).toBe(issued.length);
    expect(terminated.length).toBeGreaterThan(0);
    for (const id of terminated) {
      expect(storage.allRaffleIds()).toContain(id);
      expect(storage.activeRaffleIds()).not.toContain(id);
    }
  });

  it('keeps a large set of terminated IDs out of the active list forever', () => {
    const storage = new RaffleIdAllocator();
    const ids = Array.from({ length: 50 }, () => storage.createRaffle());
    for (const id of ids) storage.cancelRaffle(id);

    expect(storage.activeRaffleIds()).toEqual([]);
    expect(storage.allRaffleIds()).toEqual(ids);

    const fresh = storage.createRaffle();
    expect(fresh).toBe(Math.max(...ids) + 1);
    expect(storage.activeRaffleIds()).toEqual([fresh]);
  });
});

// ─── Exhaustion ───────────────────────────────────────────────────────────────

describe('RaffleIdAllocator — exhaustion of the u32 ID space', () => {
  /** Allocator whose counter sits just below exhaustion. */
  function allocatorNearEnd(): RaffleIdAllocator {
    return new RaffleIdAllocator().restore({
      lastIssuedId: MAX_RAFFLE_ID - 1,
      issuedIds: [MAX_RAFFLE_ID - 1],
      statuses: { [MAX_RAFFLE_ID - 1]: RaffleStatus.CANCELLED },
    });
  }

  it('issues the final ID and only then fails', () => {
    const storage = allocatorNearEnd();
    expect(storage.isExhausted()).toBe(false);
    expect(storage.createRaffle()).toBe(MAX_RAFFLE_ID);
    expect(storage.isExhausted()).toBe(true);
    expect(storage.peekNextRaffleId()).toBeNull();
  });

  it('throws the named exhaustion error once the space is spent', () => {
    const storage = allocatorNearEnd();
    storage.createRaffle();
    expect(() => storage.createRaffle()).toThrow(RaffleIdExhaustedError);
    try {
      storage.createRaffle();
    } catch (err) {
      expect((err as TikkaSdkError).code).toBe(TikkaSdkErrorCode.RaffleIdExhausted);
      expect((err as RaffleIdExhaustedError).name).toBe('RaffleIdExhaustedError');
    }
  });

  it('does not wrap around to reissue ID 0 or ID 1 after exhaustion', () => {
    const storage = allocatorNearEnd();
    storage.createRaffle();
    for (let i = 0; i < 3; i++) {
      expect(() => storage.createRaffle()).toThrow(RaffleIdExhaustedError);
    }
    // The counter is pinned at the last legal ID — no wrap, no reuse.
    expect(storage.peekLastIssuedId()).toBe(MAX_RAFFLE_ID);
    expect(storage.allRaffleIds()).toEqual([MAX_RAFFLE_ID - 1, MAX_RAFFLE_ID]);
  });

  it('still allows reads and terminations after exhaustion', () => {
    const storage = allocatorNearEnd();
    storage.createRaffle();
    expect(() => storage.createRaffle()).toThrow(RaffleIdExhaustedError);

    // Exhaustion stops new allocations only; existing raffles remain operable.
    expect(storage.statusOf(MAX_RAFFLE_ID - 1)).toBe(RaffleStatus.CANCELLED);
    storage.setStatus(MAX_RAFFLE_ID, RaffleStatus.DRAWING);
    storage.finalizeRaffle(MAX_RAFFLE_ID);
    expect(storage.statusOf(MAX_RAFFLE_ID)).toBe(RaffleStatus.FINALIZED);
  });

  it('rejects persisted state whose counter sits outside the u32 ID space', () => {
    expect(
      () => new RaffleIdAllocator({ lastIssuedId: MAX_RAFFLE_ID + 1, issuedIds: [], statuses: {} }),
    ).toThrow(RaffleIdExhaustedError);
    expect(() => new RaffleIdAllocator({ lastIssuedId: -1, issuedIds: [], statuses: {} })).toThrow(
      RaffleIdExhaustedError,
    );
  });
});

// ─── Upgrade invariance ───────────────────────────────────────────────────────

describe('RaffleIdAllocator — behaviour holds across contract upgrades', () => {
  it('continues the sequence after an upgrade, never restarting at 1', () => {
    const v1 = new RaffleIdAllocator();
    const a = v1.createRaffle();
    const b = v1.createRaffle();
    v1.cancelRaffle(b);

    // Deploy v2 against the same instance storage.
    const v2 = new RaffleIdAllocator(v1.snapshot());
    const c = v2.createRaffle();

    expect(c).toBe(3);
    expect(c).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(v2.allRaffleIds()).toEqual([a, b, c]);
  });

  it('keeps terminated IDs retired across an upgrade', () => {
    const v1 = new RaffleIdAllocator();
    const terminated = v1.createRaffle();
    v1.cancelRaffle(terminated);

    const v2 = new RaffleIdAllocator(v1.snapshot());
    expect(v2.statusOf(terminated)).toBe(RaffleStatus.CANCELLED);
    expect(v2.activeRaffleIds()).not.toContain(terminated);

    const afterUpgrade = Array.from({ length: 10 }, () => v2.createRaffle());
    expect(afterUpgrade).not.toContain(terminated);
    expect(Math.min(...afterUpgrade)).toBeGreaterThan(terminated);
  });

  it('never reissues an ID across a chain of upgrades', () => {
    const seen = new Set<number>();
    let storage = new RaffleIdAllocator();

    for (let version = 1; version <= 20; version++) {
      for (let i = 0; i < 5; i++) {
        const id = storage.createRaffle();
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        if (i % 2 === 0) storage.cancelRaffle(id);
        else {
          storage.setStatus(id, RaffleStatus.DRAWING);
          storage.finalizeRaffle(id);
        }
      }
      // Upgrade in place, preserving instance storage.
      storage = new RaffleIdAllocator(storage.snapshot());
    }

    expect(seen.size).toBe(100);
    expect(Math.max(...seen)).toBe(100);
  });

  it('preserves an exhausted counter across an upgrade', () => {
    const v1 = new RaffleIdAllocator().restore({
      lastIssuedId: MAX_RAFFLE_ID,
      issuedIds: [MAX_RAFFLE_ID - 1, MAX_RAFFLE_ID],
      statuses: {
        [MAX_RAFFLE_ID - 1]: RaffleStatus.CANCELLED,
        [MAX_RAFFLE_ID]: RaffleStatus.FINALIZED,
      },
    });

    const v2 = new RaffleIdAllocator(v1.snapshot());
    expect(v2.isExhausted()).toBe(true);
    expect(() => v2.createRaffle()).toThrow(RaffleIdExhaustedError);
  });

  it('rejects persisted state that reuses or reorders an ID', () => {
    expect(
      () =>
        new RaffleIdAllocator({
          lastIssuedId: 5,
          issuedIds: [1, 2, 2, 5],
          statuses: { 1: RaffleStatus.CANCELLED },
        }),
    ).toThrow(/never reused/);

    expect(
      () =>
        new RaffleIdAllocator({
          lastIssuedId: 5,
          issuedIds: [3, 1, 2],
          statuses: { 1: RaffleStatus.CANCELLED },
        }),
    ).toThrow(/never reused/);
  });

  it('rejects persisted state whose history outruns the counter', () => {
    expect(
      () => new RaffleIdAllocator({ lastIssuedId: 2, issuedIds: [1, 2, 3], statuses: {} }),
    ).toThrow(/counter is only 2/);
  });
});

// ─── Named error wiring ───────────────────────────────────────────────────────

describe('RaffleIdExhaustedError — named error surface', () => {
  it('has a dedicated SDK error code and contract error alias', () => {
    expect(TikkaSdkErrorCode.RaffleIdExhausted).toBe('RAFFLE_ID_EXHAUSTED');
    expect(ContractErrorType.RAFFLE_ID_EXHAUSTED).toBe(TikkaSdkErrorCode.RaffleIdExhausted);
    expect(RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE).toBe(6);
  });

  it('is a distinct type so callers can branch without string matching', () => {
    const err = new RaffleIdExhaustedError('spent');
    expect(err).toBeInstanceOf(RaffleIdExhaustedError);
    expect(err).toBeInstanceOf(TikkaSdkError);
    expect(err).not.toBeInstanceOf(RaffleEndedError);
    expect(err.name).toBe('RaffleIdExhaustedError');
    expect(err.code).toBe(TikkaSdkErrorCode.RaffleIdExhausted);
  });

  it('maps the contract panic code to the named error', () => {
    const mapped = toTypedContractError(
      'create_raffle failed',
      `Error(Contract, #${RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE})`,
    );
    expect(mapped).toBeInstanceOf(RaffleIdExhaustedError);
    expect(mapped?.code).toBe(TikkaSdkErrorCode.RaffleIdExhausted);
  });

  it('upgrades a generic contract failure into the named error', () => {
    const upgraded = toTypedSdkError(
      new TikkaSdkError(
        TikkaSdkErrorCode.ContractError,
        'create_raffle failed',
        `Error(Contract, #${RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE})`,
      ),
    );
    expect(upgraded).toBeInstanceOf(RaffleIdExhaustedError);
  });
});
