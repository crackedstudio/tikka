/**
 * Calendar Utilities for Raffle End Time Integration
 * 
 * This module provides utility functions for generating calendar links
 * and ICS files for multiple calendar providers.
 * 
 * Supports: Google Calendar, Outlook, Apple/iCal
 */

/**
 * Formats a Date object to ICS format (YYYYMMDDTHHMMSSZ)
 * Required by RFC 5545 for calendar events
 * 
 * @param date - Date to format
 * @returns ICS formatted date string (e.g., "20251231T235959Z")
 * 
 * @example
 * const date = new Date('2025-12-31T23:59:59Z');
 * formatIcsDate(date); // "20251231T235959Z"
 */
export function formatIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * Escapes special characters for ICS format compliance
 * Handles line breaks, semicolons, commas, and backslashes
 * 
 * @param text - Text to escape
 * @returns Escaped text safe for ICS format
 * 
 * @internal Used internally by generateIcs
 */
function escapeIcsText(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

/**
 * Generates an ICS file content for Apple/iCal
 * Includes 1-hour event duration before raffle end time
 * 
 * @param title - Event title (raffle name)
 * @param endDate - Raffle end time
 * @param url - Raffle URL
 * @param location - Optional event location
 * @returns Complete ICS file content (RFC 5545 compliant)
 * 
 * @example
 * const icsContent = generateIcs(
 *   "Luxury Watch Raffle",
 *   new Date('2025-12-31T23:59:59Z'),
 *   "https://tikka.example.com/raffle/123"
 * );
 * const blob = new Blob([icsContent], { type: 'text/calendar' });
 */
export function generateIcs(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string {
    const now = formatIcsDate(new Date());
    const end = formatIcsDate(endDate);
    // Event starts 1 hour before end
    const start = formatIcsDate(new Date(endDate.getTime() - 60 * 60 * 1000));
    const uid = `raffle-${endDate.getTime()}@tikka`;
    const description = `Don't miss the end of this raffle! ${url}`;

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Tikka//Raffle Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeIcsText(title)} – Raffle Ends`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        `URL:${url}`,
    ];

    if (location) {
        lines.push(`LOCATION:${escapeIcsText(location)}`);
    }

    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
}

/**
 * Generates Google Calendar deep link
 * Opens new event creation with pre-filled fields
 * 
 * @param title - Event title (raffle name)
 * @param endDate - Raffle end time
 * @param url - Raffle URL (used as location and in description)
 * @param location - Optional event location (takes precedence over URL)
 * @returns Google Calendar deep link URL
 * 
 * @example
 * const url = googleCalendarUrl(
 *   "Luxury Watch Raffle",
 *   new Date('2025-12-31T23:59:59Z'),
 *   "https://tikka.example.com/raffle/123"
 * );
 * window.open(url, '_blank');
 */
export function googleCalendarUrl(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string {
    const end = formatIcsDate(endDate);
    const start = formatIcsDate(new Date(endDate.getTime() - 60 * 60 * 1000));
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: `${title} – Raffle Ends`,
        dates: `${start}/${end}`,
        details: `Don't miss the end of this raffle! ${url}`,
        location: location || url,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates Outlook Calendar deep link
 * Opens new event composition with pre-filled fields
 * 
 * @param title - Event title (raffle name)
 * @param endDate - Raffle end time
 * @param url - Raffle URL (used as location and in body)
 * @param location - Optional event location (takes precedence over URL)
 * @returns Outlook Calendar deep link URL
 * 
 * @example
 * const url = outlookCalendarUrl(
 *   "Luxury Watch Raffle",
 *   new Date('2025-12-31T23:59:59Z'),
 *   "https://tikka.example.com/raffle/123"
 * );
 * window.open(url, '_blank');
 */
export function outlookCalendarUrl(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string {
    const start = new Date(endDate.getTime() - 60 * 60 * 1000).toISOString();
    const params = new URLSearchParams({
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: `${title} – Raffle Ends`,
        startdt: start,
        enddt: endDate.toISOString(),
        body: `Don't miss the end of this raffle! ${url}`,
        location: location || url,
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Generates Apple Calendar deep link via ICS file
 * Downloads an ICS file that opens in Apple Calendar
 * 
 * Note: This is a helper for creating downloadable ICS files.
 * Use within click handlers to trigger downloads.
 * 
 * @param title - Event title (raffle name)
 * @param endDate - Raffle end time
 * @param url - Raffle URL
 * @param location - Optional event location
 * @returns Blob URL for download
 * 
 * @example
 * const blobUrl = createAppleCalendarDownload(
 *   "Luxury Watch Raffle",
 *   new Date('2025-12-31T23:59:59Z'),
 *   "https://tikka.example.com/raffle/123"
 * );
 * const link = document.createElement('a');
 * link.href = blobUrl;
 * link.download = 'raffle.ics';
 * link.click();
 * URL.revokeObjectURL(blobUrl);
 */
export function createAppleCalendarDownload(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string {
    const icsContent = generateIcs(title, endDate, url, location);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    return URL.createObjectURL(blob);
}

/**
 * Helper to download an ICS file
 * 
 * @param title - Event title (used for filename)
 * @param endDate - Raffle end time
 * @param url - Raffle URL
 * @param location - Optional event location
 * 
 * @example
 * downloadIcsFile(
 *   "Luxury Watch Raffle",
 *   new Date('2025-12-31T23:59:59Z'),
 *   "https://tikka.example.com/raffle/123"
 * );
 */
export function downloadIcsFile(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): void {
    try {
        const content = generateIcs(title, endDate, url, location);
        const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${title.replace(/\s+/g, "-").toLowerCase()}-raffle.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error("Failed to download ICS file:", error);
    }
}

/**
 * Calendar event data structure
 * Used internally for type safety
 */
export interface CalendarEvent {
    title: string;
    endTime: Date;
    url: string;
    location?: string;
    startTime?: Date; // Calculated automatically if not provided
}

/**
 * Validates calendar event data
 * 
 * @param event - Event data to validate
 * @returns true if event data is valid
 * 
 * @example
 * if (isValidCalendarEvent(event)) {
 *   const url = googleCalendarUrl(event.title, event.endTime, event.url);
 * }
 */
export function isValidCalendarEvent(event: Partial<CalendarEvent>): event is CalendarEvent {
    return (
        typeof event.title === "string" &&
        event.title.length > 0 &&
        event.endTime instanceof Date &&
        typeof event.url === "string" &&
        event.url.length > 0
    );
}

/**
 * Normalizes timezone-aware dates for calendar operations
 * Ensures all dates are in UTC for consistent calendar integration
 * 
 * @param date - Date to normalize
 * @returns Date in UTC
 * 
 * @example
 * const endTime = new Date();
 * const normalized = normalizeCalendarDate(endTime);
 */
export function normalizeCalendarDate(date: Date): Date {
    return new Date(date.toISOString());
}

/**
 * Calculates calendar event duration
 * Default is 1 hour before end time
 * 
 * @param endTime - End time of event
 * @param durationMinutes - Duration in minutes (default: 60)
 * @returns Start time of event
 * 
 * @example
 * const endTime = new Date('2025-12-31T23:59:59Z');
 * const startTime = calculateCalendarStartTime(endTime);
 * // startTime is now 1 hour before endTime
 */
export function calculateCalendarStartTime(
    endTime: Date,
    durationMinutes: number = 60
): Date {
    return new Date(endTime.getTime() - durationMinutes * 60 * 1000);
}
