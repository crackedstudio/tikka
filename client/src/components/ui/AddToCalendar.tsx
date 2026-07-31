import { useState, useRef, useEffect } from "react";
import { CalendarPlus, Globe, Cloud, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    formatIcsDate,
    generateIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
} from "../../utils/calendarUtils";

export interface AddToCalendarProps {
    title: string;
    endTimeUnix: number; // Unix timestamp (seconds)
    url?: string;
    location?: string;
    className?: string;
}

/**
 * AddToCalendar Component
 * 
 * Provides calendar integration for raffle end times.
 * Supports Google Calendar, Outlook, and iCal (.ics) downloads.
 * 
 * @example
 * <AddToCalendar 
 *   title="Luxury Watch Raffle" 
 *   endTimeUnix={1735689600}
 *   url="https://tikka.example.com/raffle/123"
 *   location="Online"
 * />
 */
const AddToCalendar = ({ title, endTimeUnix, url, location, className }: AddToCalendarProps) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const endDate = new Date(endTimeUnix * 1000);
    const raffleUrl = url || (typeof window !== "undefined" ? window.location.href : "");

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const downloadIcs = () => {
        try {
            const content = generateIcs(title, endDate, raffleUrl, location);
            const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${title.replace(/\s+/g, "-").toLowerCase()}-raffle.ics`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            setOpen(false);
        } catch (error) {
            console.error("Failed to download ICS file:", error);
        }
    };

    return (
        <div className={`relative ${className || ""}`} ref={ref} data-testid="add-to-calendar">
            <button
                onClick={() => setOpen((v) => !v)}
                title={t("raffle.addToCalendar", "Add to Calendar")}
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center space-x-1 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
                <CalendarPlus className="w-4 h-4" />
                <span>{t("raffle.addToCalendar", "Add to Calendar")}</span>
            </button>

            {open && (
                <div 
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A2035] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden"
                    role="menu"
                    aria-label={t("raffle.calendarOptions", "Calendar options")}
                >
                    <a
                        href={googleCalendarUrl(title, endDate, raffleUrl, location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        role="menuitem"
                        data-testid="google-calendar-link"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <Globe className="w-4 h-4 flex-shrink-0" />
                        <span>Google Calendar</span>
                    </a>
                    <a
                        href={outlookCalendarUrl(title, endDate, raffleUrl, location)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        role="menuitem"
                        data-testid="outlook-calendar-link"
                        className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <Cloud className="w-4 h-4 flex-shrink-0" />
                        <span>Outlook Calendar</span>
                    </a>
                    <button
                        onClick={downloadIcs}
                        role="menuitem"
                        data-testid="ics-download-button"
                        className="w-full text-left flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <Download className="w-4 h-4 flex-shrink-0" />
                        <span>Download .ics</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default AddToCalendar;
