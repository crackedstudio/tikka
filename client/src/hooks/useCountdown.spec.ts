import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCountdown, type CountdownResult } from './useCountdown';

const HOUR_MS = 60 * 60 * 1000;

/** Anchors the fake clock to an exact second so assertions carry no sub-second noise. */
const EPOCH = new Date('2026-01-01T00:00:00.000Z');

/** Total number of seconds represented by a rendered countdown snapshot. */
const remainingSeconds = (value: CountdownResult): number =>
    Number(value.days) * 86400 +
    Number(value.hours) * 3600 +
    Number(value.minutes) * 60 +
    Number(value.seconds);

const setHidden = (hidden: boolean): void => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('useCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(EPOCH);
        // jsdom exposes `hidden` as a prototype getter; pin an own property so
        // every test starts from a known "tab visible" state.
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('initialises from a unix timestamp in seconds', () => {
        const endTime = EPOCH.getTime() / 1000 + 90; // 1 min 30 s
        const { result } = renderHook(() => useCountdown(endTime));

        expect(result.current.expired).toBe(false);
        expect(result.current.hours).toBe('00');
        expect(result.current.minutes).toBe('01');
        expect(result.current.seconds).toBe('30');
    });

    it('initialises from an ISO date string', () => {
        const endTime = new Date(EPOCH.getTime() + 3661_000).toISOString();
        const { result } = renderHook(() => useCountdown(endTime));

        expect(result.current.expired).toBe(false);
        expect(result.current.hours).toBe('01');
        expect(result.current.minutes).toBe('01');
        expect(result.current.seconds).toBe('01');
    });

    it('marks expired when endTime is in the past', () => {
        const endTime = EPOCH.getTime() / 1000 - 5;
        const { result } = renderHook(() => useCountdown(endTime));

        expect(result.current.expired).toBe(true);
        expect(result.current.hours).toBe('00');
        expect(result.current.minutes).toBe('00');
        expect(result.current.seconds).toBe('00');
    });

    it('stays accurate after the fake clock advances by 1 hour — no accumulated drift', () => {
        const endTime = EPOCH.getTime() / 1000 + 2 * 3600; // 2 hours from now
        const { result } = renderHook(() => useCountdown(endTime));

        expect(remainingSeconds(result.current)).toBe(7200);

        // Drives the real requestAnimationFrame loop through 225k frames. A
        // setInterval-style counter would have drifted by roughly a second here.
        act(() => {
            vi.advanceTimersByTime(HOUR_MS);
        });

        expect(result.current.expired).toBe(false);
        expect(remainingSeconds(result.current)).toBe(3600);
        // The tolerance required by the acceptance criteria.
        expect(Math.abs(remainingSeconds(result.current) - 3600)).toBeLessThanOrEqual(1);
        expect(result.current.hours).toBe('01');
        expect(result.current.minutes).toBe('00');
    });

    describe('with frames dropped (throttled tab)', () => {
        let frames: FrameRequestCallback[] = [];

        beforeEach(() => {
            frames = [];
            // Replace the faked rAF with a manual pump so frame delivery can be
            // controlled independently of the clock.
            vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
                frames.push(cb);
                return frames.length;
            });
            vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
                frames = [];
            });
        });

        /** Delivers every queued frame callback once. */
        const pumpFrame = (): void => {
            act(() => {
                const pending = frames;
                frames = [];
                pending.forEach((cb) => cb(0));
            });
        };

        it('re-derives the remaining time on every tick instead of decrementing a counter', () => {
            const endTime = EPOCH.getTime() / 1000 + 2 * 3600;
            const { result } = renderHook(() => useCountdown(endTime));

            // A full hour elapses with the loop suspended: exactly one tick is
            // enough to land on the correct value because it is recomputed from
            // endTime rather than stepped down one second at a time.
            act(() => {
                vi.advanceTimersByTime(HOUR_MS);
            });
            pumpFrame();

            expect(result.current.expired).toBe(false);
            expect(remainingSeconds(result.current)).toBe(3600);
        });

        it('does not drift when only one frame is delivered per minute', () => {
            const endTime = EPOCH.getTime() / 1000 + 2 * 3600;
            const { result } = renderHook(() => useCountdown(endTime));

            for (let minute = 0; minute < 60; minute += 1) {
                act(() => {
                    vi.advanceTimersByTime(60_000);
                });
                pumpFrame();
            }

            expect(result.current.expired).toBe(false);
            expect(Math.abs(remainingSeconds(result.current) - 3600)).toBeLessThanOrEqual(1);
            expect(result.current.hours).toBe('01');
        });
    });

    it('expires cleanly once the end time passes', () => {
        const endTime = EPOCH.getTime() / 1000 + 2;
        const { result } = renderHook(() => useCountdown(endTime));

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(result.current.expired).toBe(true);
        expect(result.current.seconds).toBe('00');
    });

    it('re-syncs correctly after the tab becomes visible again', () => {
        const endTime = EPOCH.getTime() / 1000 + 30;
        const { result } = renderHook(() => useCountdown(endTime));

        act(() => {
            setHidden(true);
            vi.advanceTimersByTime(10_000);
            setHidden(false);
        });

        expect(result.current.expired).toBe(false);
        expect(Math.abs(remainingSeconds(result.current) - 20)).toBeLessThanOrEqual(1);
        expect(result.current.seconds).toBe('20');
    });

    it('marks expired when the countdown ended while the tab was backgrounded', () => {
        const endTime = EPOCH.getTime() / 1000 + 30;
        const { result } = renderHook(() => useCountdown(endTime));

        act(() => {
            setHidden(true);
            // No frames are delivered while hidden, so the end time passes unseen.
            vi.advanceTimersByTime(60_000);
            setHidden(false);
        });

        expect(result.current.expired).toBe(true);
        expect(result.current.seconds).toBe('00');
    });

    it('recomputes when endTime changes', () => {
        const first = EPOCH.getTime() / 1000 + 3600;
        const { result, rerender } = renderHook(
            ({ endTime }: { endTime: number }) => useCountdown(endTime),
            { initialProps: { endTime: first } },
        );

        expect(result.current.hours).toBe('01');

        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        expect(result.current.minutes).toBe('59');

        // The new target renders "01:59:00" — same seconds field as the previous
        // snapshot, so a seconds-only comparison would wrongly skip the update.
        const second = EPOCH.getTime() / 1000 + 2 * 3600;
        act(() => {
            rerender({ endTime: second });
        });
        act(() => {
            vi.advanceTimersByTime(16);
        });

        expect(result.current.expired).toBe(false);
        expect(result.current.hours).toBe('01');
        expect(result.current.minutes).toBe('58');
        expect(Math.abs(remainingSeconds(result.current) - 7140)).toBeLessThanOrEqual(1);
    });
});
