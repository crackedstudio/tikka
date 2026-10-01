/**
 * raffle-id-allocation.ts
 *
 * Executable reference model of the raffle contract's ID allocation, mirroring
 * the contract's `storage::next_raffle_id` counter.
 *
 * ## The documented guarantee
 *
 * `create_raffle` returns a `u32` raffle ID drawn from a single, monotonically
 * increasing counter held in the contract's instance storage. Three properties
 * hold, and integrators may rely on all three:
 *
 *  1. **Never reused.** An ID that has been issued is never issued again — not
 *     after the raffle reaches a terminal state (`FINALIZED` or `CANCELLED`),
 *     not after an upgrade, and not after the counter would overflow.
 *  2. **Monotonic.** IDs are issued in increasing order with no gaps within a
 *     single contract instance, so a larger ID always means a later creation.
 *  3. **Bounded.** The space is `1 .. u32::MAX`. When it is spent the contract
 *     fails with the named `RAFFLE_ID_EXHAUSTED` error rather than wrapping.
 *
 * Terminal transitions do **not** free an ID. A cancelled raffle keeps its slot
 * forever; the ID is never handed to a different raffle. Integrators may
 * therefore cache against a raffle ID (including cached "this raffle no longer
 * accepts tickets" facts) without risking a stale cache being read against an
 * unrelated, newly created raffle.
 *
 * The authoritative prose lives in
 * [`docs/contracts/INTEGRATION_BOUNDARY.md`](../../../docs/contracts/INTEGRATION_BOUNDARY.md)
 * ("Raffle ID Allocation"); `raffle-id-allocation.spec.ts` asserts the
 * behaviour below against that prose.
 */

import {
  CONTRACT_ERROR_CODE,
  RaffleIdExhaustedError,
  RaffleNotFoundError,
  TikkaSdkError,
  TikkaSdkErrorCode,
} from '../utils/errors';
import { RaffleStatus } from '@tikka/types';

/** First ID the contract hands out (0 is reserved as "no raffle"). */
export const FIRST_RAFFLE_ID = 1;

/** Largest ID representable by the contract's `u32` raffle ID. */
export const MAX_RAFFLE_ID = 0xffff_ffff;

/** Number of distinct raffle IDs a single contract instance can ever issue. */
export const RAFFLE_ID_SPACE_SIZE = MAX_RAFFLE_ID;

/** Contract panic code for `RaffleIdExhausted`. */
export const RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE = CONTRACT_ERROR_CODE.RAFFLE_ID_EXHAUSTED;

/**
 * Raffle states from which a raffle never returns to `OPEN`.
 *
 * Reaching either of these terminates the raffle. The contract's allocation
 * counter is untouched by the transition, so the terminated raffle's ID is
 * retired rather than released.
 */
export const TERMINAL_RAFFLE_STATUSES: readonly RaffleStatus[] = Object.freeze([
  RaffleStatus.FINALIZED,
  RaffleStatus.CANCELLED,
]);

/** @returns `true` when `status` is a state a raffle can never leave. */
export function isTerminalRaffleStatus(status: RaffleStatus): boolean {
  return TERMINAL_RAFFLE_STATUSES.includes(status);
}

/** The contract's allocation counter, as persisted in instance storage. */
export interface RaffleIdCounterState {
  /** Highest ID issued so far. `0` means none have been issued. */
  readonly lastIssuedId: number;
}

/** Full persisted allocation state, as carried across a contract upgrade. */
export interface RaffleIdStorageState extends RaffleIdCounterState {
  /** Every ID ever issued, in issuance order. */
  readonly issuedIds: readonly number[];
  /** ID → current status, for every issued ID. */
  readonly statuses: Readonly<Record<number, RaffleStatus>>;
}

/**
 * Returns the ID following `lastIssuedId`, or `null` if the space is spent.
 *
 * Allocation is a pure function of the counter, which is what makes the
 * guarantee auditable: given the persisted counter there is exactly one
 * possible next ID, and it is always greater than every previously issued ID.
 */
export function nextRaffleId(lastIssuedId: number): number | null {
  if (lastIssuedId >= MAX_RAFFLE_ID) return null;
  return lastIssuedId + 1;
}

/**
 * Allocates the next raffle ID from `counter`.
 *
 * @throws {RaffleIdExhaustedError} when every ID in the `u32` space has been
 *         issued. The counter is left untouched — allocation never wraps, so a
 *         failed call cannot make a spent ID available again.
 */
export function allocateRaffleId(counter: RaffleIdCounterState): number {
  const next = nextRaffleId(counter.lastIssuedId);
  if (next === null) {
    throw new RaffleIdExhaustedError(
      `Raffle ID space exhausted: all ${RAFFLE_ID_SPACE_SIZE} IDs (1..${MAX_RAFFLE_ID}) ` +
        `have been issued. create_raffle fails with ${TikkaSdkErrorCode.RaffleIdExhausted} ` +
        `(contract error #${RAFFLE_ID_EXHAUSTED_CONTRACT_ERROR_CODE}); IDs are never reused.`,
    );
  }
  return next;
}

/**
 * Reference model of the raffle contract's ID allocation.
 *
 * Models the contract's instance storage closely enough to exercise the
 * documented guarantees: a monotonic counter that is advanced only by
 * allocation, and a status record per issued ID that terminal transitions
 * update without touching the counter.
 *
 * @example
 * ```ts
 * const storage = new RaffleIdAllocator();
 * const a = storage.createRaffle();            // 1
 * storage.cancelRaffle(a);                      // terminates, does not free the ID
 * const b = storage.createRaffle();            // 2 — a is never reissued
 * ```
 */
export class RaffleIdAllocator {
  private lastIssuedId = 0;
  private issuedIds: number[] = [];
  private readonly statuses = new Map<number, RaffleStatus>();

  /**
   * @param state Persisted storage to resume from. Omit for a fresh contract
   *        instance; pass `snapshot()` output to resume after an upgrade.
   * @throws {RaffleIdExhaustedError} if `state` places the counter or an
   *         issued ID outside the `u32` ID space.
   * @throws {TikkaSdkError} `ValidationError` if the issued-ID history is not
   *         strictly increasing, or outruns the counter.
   */
  constructor(state?: RaffleIdStorageState) {
    if (state) this.restore(state);
  }

  /**
   * Allocates and reserves the next raffle ID, as `create_raffle` does.
   *
   * @throws {RaffleIdExhaustedError} once the `u32` ID space is spent.
   */
  createRaffle(): number {
    const id = allocateRaffleId({ lastIssuedId: this.lastIssuedId });
    this.lastIssuedId = id;
    this.issuedIds.push(id);
    this.statuses.set(id, RaffleStatus.OPEN);
    return id;
  }

  /**
   * Moves a raffle to a new state, as the lifecycle methods do.
   *
   * Terminal transitions deliberately leave the allocation counter alone.
   *
   * @throws {RaffleNotFoundError} if `id` was never issued, or
   *         {@link TikkaSdkError} `ValidationError` if the transition is not one
   *         the contract allows.
   */
  setStatus(id: number, status: RaffleStatus): void {
    this.assertIssued(id);
    const current = this.statuses.get(id)!;
    if (!isAllowedTransition(current, status)) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Raffle ${id} cannot move from ${current} to ${status}`,
      );
    }
    this.statuses.set(id, status);
  }

  /** Cancels a raffle. Terminal — the ID stays retired. */
  cancelRaffle(id: number): void {
    this.setStatus(id, RaffleStatus.CANCELLED);
  }

  /** Finalizes a raffle. Terminal — the ID stays retired. */
  finalizeRaffle(id: number): void {
    this.setStatus(id, RaffleStatus.FINALIZED);
  }

  /** @returns the highest ID issued so far, or `0` if none. */
  peekLastIssuedId(): number {
    return this.lastIssuedId;
  }

  /** @returns the next ID that `createRaffle` would issue, or `null` if spent. */
  peekNextRaffleId(): number | null {
    return nextRaffleId(this.lastIssuedId);
  }

  /** @returns the ID `createRaffle` will fail with, or `false` if space remains. */
  isExhausted(): boolean {
    return nextRaffleId(this.lastIssuedId) === null;
  }

  /** @returns status of `id`, or `undefined` if it was never issued. */
  statusOf(id: number): RaffleStatus | undefined {
    return this.statuses.get(id);
  }

  /** @returns every ID ever issued, in issuance order (mirrors `get_all_raffle_ids`). */
  allRaffleIds(): number[] {
    return [...this.issuedIds];
  }

  /** @returns IDs still accepting tickets (mirrors `get_active_raffle_ids`). */
  activeRaffleIds(): number[] {
    return this.issuedIds.filter((id) => this.statuses.get(id) === RaffleStatus.OPEN);
  }

  /**
   * Serialises the full allocation state.
   *
   * Passing this to a new `RaffleIdAllocator` models a contract upgrade: the
   * code changes, the storage does not.
   */
  snapshot(): RaffleIdStorageState {
    return {
      lastIssuedId: this.lastIssuedId,
      issuedIds: [...this.issuedIds],
      statuses: Object.fromEntries(this.statuses),
    };
  }

  /**
   * Restores a snapshot taken by {@link snapshot}. Returns `this` for chaining.
   *
   * Validates the invariants the never-reused guarantee rests on: the counter
   * stays inside the `u32` space and the issued-ID history is strictly
   * increasing with no duplicates.
   *
   * @throws {RaffleIdExhaustedError} if the counter or an issued ID falls
   *         outside the `u32` ID space.
   * @throws {TikkaSdkError} `ValidationError` if the issued-ID history is not
   *         strictly increasing, or outruns the counter.
   */
  restore(state: RaffleIdStorageState): this {
    if (state.lastIssuedId < 0 || state.lastIssuedId > MAX_RAFFLE_ID) {
      throw new RaffleIdExhaustedError(
        `Invalid raffle ID storage: counter ${state.lastIssuedId} is outside the ` +
          `u32 ID space (0..${MAX_RAFFLE_ID}).`,
      );
    }

    let previous = 0;
    for (const id of state.issuedIds) {
      if (id < FIRST_RAFFLE_ID || id > MAX_RAFFLE_ID) {
        throw new RaffleIdExhaustedError(
          `Invalid raffle ID storage: issued ID ${id} is outside the u32 ID space ` +
            `(${FIRST_RAFFLE_ID}..${MAX_RAFFLE_ID}).`,
        );
      }
      if (id <= previous) {
        throw new TikkaSdkError(
          TikkaSdkErrorCode.ValidationError,
          `Invalid raffle ID storage: ID ${id} follows ${previous}. ` +
            `Issued raffle IDs are strictly increasing — an ID is never reused.`,
        );
      }
      previous = id;
    }

    if (previous > state.lastIssuedId) {
      throw new TikkaSdkError(
        TikkaSdkErrorCode.ValidationError,
        `Invalid raffle ID storage: ID ${previous} was issued but the counter is only ` +
          `${state.lastIssuedId}.`,
      );
    }

    this.lastIssuedId = state.lastIssuedId;
    this.issuedIds = [...state.issuedIds];
    this.statuses.clear();
    for (const [id, status] of Object.entries(state.statuses)) {
      this.statuses.set(Number(id), status);
    }

    return this;
  }

  private assertIssued(id: number): void {
    if (!this.statuses.has(id)) {
      throw new RaffleNotFoundError(`RAFFLE_NOT_FOUND: raffle ${id} was never issued`);
    }
  }
}

/** State machine mirroring the contract's `RaffleStatus` transitions. */
const ALLOWED_TRANSITIONS: Record<RaffleStatus, readonly RaffleStatus[]> = Object.freeze({
  [RaffleStatus.OPEN]: [RaffleStatus.OPEN, RaffleStatus.DRAWING, RaffleStatus.CANCELLED],
  [RaffleStatus.DRAWING]: [RaffleStatus.DRAWING, RaffleStatus.FINALIZED, RaffleStatus.CANCELLED],
  [RaffleStatus.FINALIZED]: [RaffleStatus.FINALIZED],
  [RaffleStatus.CANCELLED]: [RaffleStatus.CANCELLED],
});

/** @returns `true` if the contract permits `from` → `to`. */
export function isAllowedTransition(from: RaffleStatus, to: RaffleStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
