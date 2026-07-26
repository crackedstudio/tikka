/**
 * AddToCalendar Component Examples
 * 
 * This file demonstrates various usage patterns for the AddToCalendar component.
 */

import AddToCalendar from './AddToCalendar';
import {
    generateIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
    downloadIcsFile,
    createAppleCalendarDownload,
} from '../../utils/calendarUtils';

/**
 * Example 1: Basic Usage in a Raffle Card
 */
export function BasicRaffleCardExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/123';

    return (
        <div className="raffle-card">
            <h3>Luxury Watch Raffle</h3>
            <p>Join our exclusive raffle for a luxury watch!</p>
            
            <AddToCalendar 
                title="Luxury Watch Raffle"
                endTimeUnix={endTime}
                url={raffleUrl}
            />
        </div>
    );
}

/**
 * Example 2: With Location
 */
export function RaffleCardWithLocationExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/456';

    return (
        <div className="raffle-card">
            <h3>Real Estate Raffle</h3>
            
            <AddToCalendar 
                title="Real Estate Raffle - Grand Prize Draw"
                endTimeUnix={endTime}
                url={raffleUrl}
                location="New York, NY"
            />
        </div>
    );
}

/**
 * Example 3: In RafflePage (Realistic Integration)
 */
export interface Raffle {
    id: number;
    title: string;
    end_time: string; // ISO string
    location?: string;
}

export function RafflePageExample({ raffle }: { raffle: Raffle }) {
    const endTimeUnix = Math.floor(new Date(raffle.end_time).getTime() / 1000);
    const raffleUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/raffle/${raffle.id}`;

    return (
        <div className="raffle-page-sidebar">
            <div className="sticky top-6 space-y-4">
                <div>
                    <h2 className="text-2xl font-bold mb-2">{raffle.title}</h2>
                    
                    {/* Countdown timer would go here */}
                    {/* <CountdownTimer endTime={raffle.end_time} /> */}
                </div>

                {/* Calendar integration */}
                <div className="border-t pt-4">
                    <AddToCalendar 
                        title={raffle.title}
                        endTimeUnix={endTimeUnix}
                        url={raffleUrl}
                        location={raffle.location}
                        className="mt-4"
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Example 4: Standalone URL Generation
 */
export function StandaloneUrlGenerationExample() {
    const title = 'Premium Watch Raffle';
    const endDate = new Date('2025-12-31T23:59:59Z');
    const raffleUrl = 'https://tikka.example.com/raffle/789';
    const location = 'Online Event';

    // Generate URLs for different providers
    const googleUrl = googleCalendarUrl(title, endDate, raffleUrl, location);
    const outlookUrl = outlookCalendarUrl(title, endDate, raffleUrl, location);

    return (
        <div className="calendar-links">
            <h3>Add to Calendar</h3>
            
            <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                Add to Google Calendar
            </a>
            
            <a href={outlookUrl} target="_blank" rel="noopener noreferrer">
                Add to Outlook
            </a>
        </div>
    );
}

/**
 * Example 5: Standalone ICS Download
 */
export function StandaloneIcsDownloadExample() {
    const title = 'Premium Watch Raffle';
    const endDate = new Date('2025-12-31T23:59:59Z');
    const raffleUrl = 'https://tikka.example.com/raffle/789';

    const handleDownload = () => {
        downloadIcsFile(title, endDate, raffleUrl);
    };

    return (
        <button onClick={handleDownload}>
            Download Calendar Event
        </button>
    );
}

/**
 * Example 6: Custom Implementation
 */
export function CustomCalendarIntegrationExample() {
    const title = 'Luxury Car Raffle';
    const endDate = new Date('2025-12-31T23:59:59Z');
    const raffleUrl = 'https://tikka.example.com/raffle/999';
    const location = 'Virtual Event';

    // Generate ICS content manually
    const handleCustomAction = () => {
        const icsContent = generateIcs(title, endDate, raffleUrl, location);
        
        // Example: Send to backend
        fetch('/api/calendar/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                icsContent,
                raffleId: 999,
            }),
        });
    };

    return (
        <button onClick={handleCustomAction}>
            Send Calendar Reminder
        </button>
    );
}

/**
 * Example 7: Mobile-Optimized Usage
 */
export function MobileOptimizedExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/mobile';

    return (
        <div className="mobile-raffle-view">
            <div className="space-y-4 p-4">
                <h1>Exclusive Raffle</h1>
                
                {/* Component adapts to mobile screens */}
                <AddToCalendar 
                    title="Exclusive Raffle Event"
                    endTimeUnix={endTime}
                    url={raffleUrl}
                    className="w-full"
                />
            </div>
        </div>
    );
}

/**
 * Example 8: Accessible Implementation
 */
export function AccessibleExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/accessible';

    return (
        <div className="accessible-raffle">
            <h1>Luxury Watch Raffle</h1>
            <p>Prize: A luxury timepiece worth $10,000</p>
            <p>Ends: December 31, 2025 at 11:59 PM</p>
            
            {/* Component includes full ARIA support */}
            <AddToCalendar 
                title="Luxury Watch Raffle"
                endTimeUnix={endTime}
                url={raffleUrl}
            />
        </div>
    );
}

/**
 * Example 9: Dark Mode Support
 */
export function DarkModeExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/dark';

    return (
        <div className="dark bg-slate-900 p-8 rounded-lg">
            <h1 className="text-white mb-4">Raffle Event</h1>
            
            {/* Component automatically adapts to dark mode */}
            <AddToCalendar 
                title="Raffle Event"
                endTimeUnix={endTime}
                url={raffleUrl}
            />
        </div>
    );
}

/**
 * Example 10: Error Handling
 */
export function ErrorHandlingExample() {
    const title = 'Raffle Event';
    const endDate = new Date('2025-12-31T23:59:59Z');
    const raffleUrl = 'https://tikka.example.com/raffle/error-handling';

    const handleSafeDownload = () => {
        try {
            downloadIcsFile(title, endDate, raffleUrl);
        } catch (error) {
            console.error('Failed to download calendar:', error);
            // Show user-friendly error message
            alert('Could not download calendar file. Please try again.');
        }
    };

    return (
        <button onClick={handleSafeDownload}>
            Download Calendar (with error handling)
        </button>
    );
}

/**
 * Example 11: Multiple Raffles List
 */
export interface RaffleListItem {
    id: number;
    title: string;
    endTime: number;
}

export function RaffleListExample({ raffles }: { raffles: RaffleListItem[] }) {
    return (
        <div className="raffle-list space-y-4">
            {raffles.map((raffle) => (
                <div 
                    key={raffle.id} 
                    className="raffle-item border p-4 rounded-lg"
                >
                    <h3>{raffle.title}</h3>
                    
                    <AddToCalendar 
                        title={raffle.title}
                        endTimeUnix={raffle.endTime}
                        url={`https://tikka.example.com/raffle/${raffle.id}`}
                        className="mt-2"
                    />
                </div>
            ))}
        </div>
    );
}

/**
 * Example 12: Internationalization Support
 * 
 * The component uses i18n with these translation keys:
 * - raffle.addToCalendar (button label)
 * - raffle.calendarOptions (menu label)
 */
export function I18nExample() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    const raffleUrl = 'https://tikka.example.com/raffle/i18n';

    return (
        <div className="i18n-example">
            {/* Component text automatically translates based on i18n configuration */}
            <AddToCalendar 
                title="Rifa de Reloj de Lujo" // Spanish title
                endTimeUnix={endTime}
                url={raffleUrl}
            />
        </div>
    );
}
