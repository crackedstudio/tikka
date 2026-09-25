import React, { useRef, useState } from 'react';
import { useCountdown } from '../../hooks/useCountdown';
import { useTranslation } from 'react-i18next';

interface CountdownTimerProps {
    endTime: string | number;
    className?: string;
    itemClassName?: string;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ 
    endTime, 
    className = "flex space-x-2 font-mono text-sm",
    itemClassName = "bg-gray-300 dark:bg-white/10 px-2 py-0.5 rounded text-gray-900 dark:text-white"
}) => {
    const { t } = useTranslation();
    const { days, hours, minutes, seconds, expired } = useCountdown(endTime);
    const announcedRef = useRef<Set<string>>(new Set());
    const [announcement, setAnnouncement] = useState<string>('');

    if (expired) {
        return (
            <>
                <div aria-hidden="true" className="flex items-center space-x-2 bg-gray-500/20 text-gray-400 px-3 py-1 rounded-full border border-gray-500/30 backdrop-blur-md shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider">{t("raffle.ended", "Ended")}</span>
                </div>
                <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
            </>
        );
    }

    return (
        <>
            <div aria-hidden="true" className={className}>
                {parseInt(days) > 0 && <span className={itemClassName}>{days}d</span>}
                <span className={itemClassName}>{hours}h</span>
                <span className={itemClassName}>{minutes}m</span>
                <span className={itemClassName}>{seconds}s</span>
            </div>
            <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
        </>
    );
};
