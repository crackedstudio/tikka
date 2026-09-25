import { useState, useEffect, useCallback, useRef } from 'react';

export type CountdownResult = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    expired: boolean;
};

export const useCountdown = (endTime: string | number): CountdownResult => {
    const targetMs = typeof endTime === 'string' ? new Date(endTime).getTime() : endTime * 1000;

    const calculate = useCallback((): CountdownResult => {
        const diff = targetMs - Date.now();
        if (diff <= 0) {
            return { days: '00', hours: '00', minutes: '00', seconds: '00', expired: true };
        }
        return {
            days: String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(2, '0'),
            hours: String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, '0'),
            minutes: String(Math.floor((diff / 1000 / 60) % 60)).padStart(2, '0'),
            seconds: String(Math.floor((diff / 1000) % 60)).padStart(2, '0'),
            expired: false,
        };
    }, [targetMs]);

    const [timeLeft, setTimeLeft] = useState<CountdownResult>(() => calculate());
    const rafRef = useRef<number>(0);
    // Tracks the last rendered second to avoid a 60fps React re-render cascade.
    const lastSecRef = useRef<number>(-1);

    useEffect(() => {
        let active = true;

        const tick = () => {
            if (!active) return;
            const next = calculate();
            const secValue = next.expired ? -1 : Number(next.seconds);
            if (secValue !== lastSecRef.current) {
                lastSecRef.current = secValue;
                setTimeLeft(next);
            }
            if (!next.expired) {
                rafRef.current = requestAnimationFrame(tick);
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                cancelAnimationFrame(rafRef.current);
            } else {
                // Force an immediate re-sync when the tab becomes visible again.
                lastSecRef.current = -1;
                rafRef.current = requestAnimationFrame(tick);
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            active = false;
            cancelAnimationFrame(rafRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [calculate]);

    return timeLeft;
};
