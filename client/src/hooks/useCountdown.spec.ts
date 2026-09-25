import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useCountdown } from './useCountdown';

describe('useCountdown', () => {
    let rafQueue: FrameRequestCallback[];

    beforeEach(() => {
        // Fake Date so Date.now() is controllable; leave RAF to our manual mock.
        vi.useFakeTimers();
        rafQueue = [];

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
            rafQueue = [];
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Flush one pending RAF tick and let React settle.
    function tick() {
        act(() => {
            const pending = [...rafQueue];
            rafQueue = [];
            pending.forEach((cb) => cb(0));
        });
    }

    it('initialises with the correct remaining time', () => {
        const endTime = Date.now() + 90_000; // 1 min 30 s
        const { result } = renderHook(() => useCountdown(endTime));
        expect(result.current.expired).toBe(false);
        expect(result.current.minutes).toBe('01');
        expect(result.current.seconds).toBe('30');
    });

    it('marks expired when endTime is in the past', () => {
        const endTime = Date.now() - 500;
        const { result } = renderHook(() => useCountdown(endTime));
        tick();
        expect(result.current.expired).toBe(true);
        expect(result.current.hours).toBe('00');
        expect(result.current.minutes).toBe('00');
        expect(result.current.seconds).toBe('00');
    });

    it('displays accurate remaining time after advancing fake clock by 1 hour — no drift', () => {
        const now = Date.now();
        const endTime = now + 2 * 60 * 60 * 1000; // 2 hours from now

        const { result } = renderHook(() => useCountdown(endTime));

        // Initial state: ~2 hours remaining.
        expect(result.current.hours).toBe('02');
        expect(result.current.minutes).toBe('00');

        // Advance fake clock by exactly 1 hour. With setInterval-based counters
        // this would accumulate drift; with Date.now()-anchored RAF it cannot.
        act(() => {
            vi.advanceTimersByTime(60 * 60 * 1000);
        });
        tick();

        expect(result.current.expired).toBe(false);
        expect(result.current.hours).toBe('01');
        expect(result.current.minutes).toBe('00');
        // Remaining seconds must be within 1 second of 0 (no accumulated drift).
        expect(Number(result.current.seconds)).toBeLessThanOrEqual(1);
    });

    it('expires cleanly once the end time passes', () => {
        const endTime = Date.now() + 1500; // 1.5 s
        const { result } = renderHook(() => useCountdown(endTime));

        act(() => { vi.advanceTimersByTime(2000); });
        tick();

        expect(result.current.expired).toBe(true);
    });

    it('re-syncs correctly after the tab becomes visible again', () => {
        const endTime = Date.now() + 30_000; // 30 s

        const { result } = renderHook(() => useCountdown(endTime));
        tick();
        expect(result.current.seconds).toBe('30');

        // Simulate tab hidden for 10 s.
        act(() => {
            Object.defineProperty(document, 'hidden', { value: true, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            vi.advanceTimersByTime(10_000);
        });

        // Simulate tab visible again.
        act(() => {
            Object.defineProperty(document, 'hidden', { value: false, configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        tick();

        // 20 s should remain (within 1 s tolerance).
        expect(result.current.expired).toBe(false);
        const remaining = Number(result.current.seconds) + Number(result.current.minutes) * 60;
        expect(Math.abs(remaining - 20)).toBeLessThanOrEqual(1);
    });
});
