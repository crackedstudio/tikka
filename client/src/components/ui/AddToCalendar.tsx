import { useState, useRef, useEffect } from "react";
import { CalendarPlus } from "lucide-react";

interface AddToCalendarProps {
    title: string;
    endTimeUnix: number; // Unix timestamp (seconds)
    url?: string;
}

function formatIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function generateIcs(title: string, endDate: Date, url: string): string {
    const now = formatIcsDate(new Date());
    const end = formatIcsDate(endDate);
    // Event starts 1 hour before end
    const start = formatIcsDate(new Date(endDate.getTime() - 60 * 60 * 1000));
    const uid = `raffle-${endDate.getTime()}@tikka`;

    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tikka//Raffle Calendar//EN",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title} – Raffle Ends`,
        `DESCRIPTION:Don't miss the end of this raffle! ${url}`,
        `URL:${url}`,
        "END:VEVENT",
        "END:VCALENDAR",
    ].join("\r\n");
}

function googleCalendarUrl(title: string, endDate: Date, url: string): string {
    const end = endDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const start = new Date(endDate.getTime() - 60 * 60 * 1000)
        .toISOString()
        .replace(/[-:]/g, "")
        .split(".")[0] + "Z";
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: `${title} – Raffle Ends`,
        dates: `${start}/${end}`,
        details: `Don't miss the end of this raffle! ${url}`,
        location: url,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookCalendarUrl(title: string, endDate: Date, url: string): string {
    const start = new Date(endDate.getTime() - 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: `${title} – Raffle Ends`,
        startdt: start,
        enddt: endDate.toISOString(),
        body: `Don't miss the end of this raffle! ${url}`,
        location: url,
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

const AddToCalendar = ({ title, endTimeUnix, url }: AddToCalendarProps) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const endDate = new Date(endTimeUnix * 1000);
    const raffleUrl = url || window.location.href;

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
        const content = generateIcs(title, endDate, raffleUrl);
        const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${title.replace(/\s+/g, "-")}-raffle.ics`;
        link.click();
        URL.revokeObjectURL(link.href);
        setOpen(false);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                title="Add to Calendar"
                className="flex items-center space-x-1 text-xs text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
                <CalendarPlus className="w-4 h-4" />
                <span>Add to Calendar</span>
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A2035] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <a
                        href={googleCalendarUrl(title, endDate, raffleUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        Google Calendar
                    </a>
                    <a
                        href={outlookCalendarUrl(title, endDate, raffleUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpen(false)}
                        className="flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        Outlook Calendar
                    </a>
                    <button
                        onClick={downloadIcs}
                        className="w-full text-left flex items-center px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        Download .ics
                    </button>
                </div>
            )}
        </div>
    );
};

export default AddToCalendar;
