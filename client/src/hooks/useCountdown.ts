import { useEffect, useRef, useState } from 'react';

export type CountdownResult = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    expired: boolean;
};

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const EXPIRED: CountdownResult = {
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00',
    expired: true,
};

/**
 * `endTime` is either an ISO date string or a unix timestamp in **seconds**
 * (raffleService formats `end_time` as `Math.floor(ms / 1000)`).
 */
const toTargetMs = (endTime: string | number): number =>
    typeof endTime === 'string' ? new Date(endTime).getTime() : endTime * SECOND_MS;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Every value is derived from the wall clock rather than from a counter that is
 * decremented per tick, so a late/throttled frame can never accumulate error.
 */
const compute = (targetMs: number): CountdownResult => {
    const diff = targetMs - Date.now();
    if (diff <= 0) {
        return EXPIRED;
    }
    return {
        days: pad(Math.floor(diff / DAY_MS)),
        hours: pad(Math.floor(diff / HOUR_MS) % 24),
        minutes: pad(Math.floor(diff / MINUTE_MS) % 60),
        seconds: pad(Math.floor(diff / SECOND_MS) % 60),
        expired: false,
    };
};

/** Identity of a rendered snapshot, used to skip redundant re-renders. */
const renderKey = (value: CountdownResult): string =>
    value.expired ? 'expired' : `${value.days}:${value.hours}:${value.minutes}:${value.seconds}`;

export const useCountdown = (endTime: string | number): CountdownResult => {
    const targetMs = toTargetMs(endTime);

    const [timeLeft, setTimeLeft] = useState<CountdownResult>(() => compute(targetMs));

    // Last published snapshot, tagged with the target it was computed for so a
    // new endTime always republishes even when it renders identically.
    const renderedRef = useRef<{ targetMs: number; key: string }>({
        targetMs,
        key: renderKey(timeLeft),
    });

    useEffect(() => {
        let active = true;
        let frame = 0;

        /** Publishes `next` when it differs from the last rendered snapshot. */
        const publish = (next: CountdownResult): boolean => {
            const key = renderKey(next);
            const rendered = renderedRef.current;
            if (rendered.targetMs === targetMs && rendered.key === key) {
                return next.expired;
            }
            renderedRef.current = { targetMs, key };
            setTimeLeft(next);
            return next.expired;
        };

        const tick = () => {
            if (!active) return;
            // Re-derive the remaining time from endTime + Date.now() on every
            // frame: a setInterval-style decrement would drift by ~1s per hour
            // on long raffles, and a re-sync here makes that impossible.
            if (!publish(compute(targetMs))) {
                frame = requestAnimationFrame(tick);
            }
        };

        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(tick);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                cancelAnimationFrame(frame);
                return;
            }
            // Frames are suspended while backgrounded, so re-sync from the wall
            // clock immediately rather than waiting for the next frame — the
            // countdown may well have ended in the meantime.
            publish(compute(targetMs));
            schedule();
        };

        schedule();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            active = false;
            cancelAnimationFrame(frame);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [targetMs]);

    return timeLeft;
};
