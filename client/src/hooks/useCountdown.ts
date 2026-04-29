import { useState, useEffect, useCallback } from 'react';

export type CountdownResult = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
    expired: boolean;
};

export const useCountdown = (endTime: string | number): CountdownResult => {
    const calculateTimeLeft = useCallback(() => {
        const targetTime = typeof endTime === 'string' ? new Date(endTime).getTime() : endTime * 1000;
        const now = Date.now();
        const difference = targetTime - now;

        if (difference <= 0) {
            return {
                days: '00',
                hours: '00',
                minutes: '00',
                seconds: '00',
                expired: true,
            };
        }

        return {
            days: String(Math.floor(difference / (1000 * 60 * 60 * 24))).padStart(2, '0'),
            hours: String(Math.floor((difference / (1000 * 60 * 60)) % 24)).padStart(2, '0'),
            minutes: String(Math.floor((difference / 1000 / 60) % 60)).padStart(2, '0'),
            seconds: String(Math.floor((difference / 1000) % 60)).padStart(2, '0'),
            expired: false,
        };
    }, [endTime]);

    const [timeLeft, setTimeLeft] = useState<CountdownResult>(calculateTimeLeft());

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        const startInterval = () => {
            if (interval) return;
            interval = setInterval(() => {
                const newTimeLeft = calculateTimeLeft();
                setTimeLeft(newTimeLeft);
                if (newTimeLeft.expired) {
                    stopInterval();
                }
            }, 1000);
        };

        const stopInterval = () => {
            if (interval) {
                clearInterval(interval);
                interval = null;
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                stopInterval();
            } else {
                // Instantly update before starting the interval again
                setTimeLeft(calculateTimeLeft());
                startInterval();
            }
        };

        // Initial start
        startInterval();

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopInterval();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [calculateTimeLeft]);

    return timeLeft;
};
