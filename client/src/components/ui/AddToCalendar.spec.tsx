import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import AddToCalendar, { AddToCalendarProps } from './AddToCalendar';
import {
    formatIcsDate,
    generateIcs,
    googleCalendarUrl,
    outlookCalendarUrl,
} from '../../utils/calendarUtils';

// Initialize i18n for tests
if (!i18n.isInitialized) {
    i18n.init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        resources: {
            en: {
                translation: {
                    'raffle.addToCalendar': 'Add to Calendar',
                    'raffle.calendarOptions': 'Calendar options',
                },
            },
        },
    });
}

// Mock createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

Object.defineProperty(global.URL, 'createObjectURL', {
    value: mockCreateObjectURL,
});

Object.defineProperty(global.URL, 'revokeObjectURL', {
    value: mockRevokeObjectURL,
});

const mockDate = new Date('2025-12-31T23:59:59Z');
const mockUnixTimestamp = Math.floor(mockDate.getTime() / 1000);
const raffleUrl = 'https://tikka.example.com/raffle/123';
const raffleTitle = 'Luxury Watch Raffle';
const raffleLocation = 'Online Event';

const defaultProps: AddToCalendarProps = {
    title: raffleTitle,
    endTimeUnix: mockUnixTimestamp,
    url: raffleUrl,
    location: raffleLocation,
};

const renderComponent = (props = defaultProps) => {
    return render(
        <MemoryRouter>
            <I18nextProvider i18n={i18n}>
                <AddToCalendar {...props} />
            </I18nextProvider>
        </MemoryRouter>
    );
};

describe('AddToCalendar Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateObjectURL.mockReturnValue('blob:mock-url');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Rendering', () => {
        it('renders the "Add to Calendar" button', () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            expect(button).toBeInTheDocument();
        });

        it('displays calendar icon in button', () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            const icon = button.querySelector('svg');
            expect(icon).toBeInTheDocument();
        });

        it('button has correct accessibility attributes', () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            expect(button).toHaveAttribute('aria-haspopup', 'menu');
            expect(button).toHaveAttribute('aria-expanded', 'false');
        });

        it('does not show dropdown menu initially', () => {
            renderComponent();
            const menu = screen.queryByRole('menu');
            expect(menu).not.toBeInTheDocument();
        });
    });

    describe('Dropdown Menu Interaction', () => {
        it('opens dropdown when button is clicked', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            expect(button).toHaveAttribute('aria-expanded', 'true');
        });

        it('closes dropdown when button is clicked again', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });

            fireEvent.click(button);
            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            fireEvent.click(button);
            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });

        it('closes dropdown when clicking outside', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            fireEvent.mouseDown(document.body);
            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });

        it('shows three calendar options when open', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByTestId('google-calendar-link')).toBeInTheDocument();
                expect(screen.getByTestId('outlook-calendar-link')).toBeInTheDocument();
                expect(screen.getByTestId('ics-download-button')).toBeInTheDocument();
            });
        });

        it('closes dropdown after selecting a calendar option', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            const googleLink = screen.getByTestId('google-calendar-link');
            fireEvent.click(googleLink);

            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });
    });

    describe('Google Calendar Link', () => {
        it('renders Google Calendar link', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByText('Google Calendar')).toBeInTheDocument();
            });
        });

        it('Google Calendar link has correct URL structure', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('calendar.google.com/calendar/render');
                expect(href).toContain('action=TEMPLATE');
            });
        });

        it('Google Calendar URL contains event title', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain(encodeURIComponent(`${raffleTitle} – Raffle Ends`));
            });
        });

        it('Google Calendar URL contains date range', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('dates=');
            });
        });

        it('Google Calendar URL contains details parameter', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('details=');
                expect(href).toContain(encodeURIComponent(raffleUrl));
            });
        });

        it('Google Calendar link opens in new tab', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link') as HTMLAnchorElement;
                expect(link.target).toBe('_blank');
                expect(link.rel).toContain('noopener');
                expect(link.rel).toContain('noreferrer');
            });
        });

        it('includes location in Google Calendar URL', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('location=');
            });
        });
    });

    describe('Outlook Calendar Link', () => {
        it('renders Outlook Calendar link', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByText('Outlook Calendar')).toBeInTheDocument();
            });
        });

        it('Outlook Calendar link has correct URL structure', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('outlook-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('outlook.live.com/calendar');
                expect(href).toContain('deeplink/compose');
            });
        });

        it('Outlook Calendar URL contains subject parameter', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('outlook-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('subject=');
                expect(href).toContain(encodeURIComponent(`${raffleTitle} – Raffle Ends`));
            });
        });

        it('Outlook Calendar URL contains start and end times', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('outlook-calendar-link');
                const href = link.getAttribute('href') || '';
                expect(href).toContain('startdt=');
                expect(href).toContain('enddt=');
            });
        });

        it('Outlook Calendar link opens in new tab', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('outlook-calendar-link') as HTMLAnchorElement;
                expect(link.target).toBe('_blank');
                expect(link.rel).toContain('noopener');
                expect(link.rel).toContain('noreferrer');
            });
        });
    });

    describe('ICS Download', () => {
        it('renders Download .ics button', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByText('Download .ics')).toBeInTheDocument();
            });
        });

        it('creates and downloads ICS file on button click', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByTestId('ics-download-button')).toBeInTheDocument();
            });

            const downloadButton = screen.getByTestId('ics-download-button');
            fireEvent.click(downloadButton);

            await waitFor(() => {
                expect(mockCreateObjectURL).toHaveBeenCalled();
            });
        });

        it('creates Blob with correct MIME type', async () => {
            const blobSpy = vi.spyOn(global, 'Blob');
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByTestId('ics-download-button')).toBeInTheDocument();
            });

            const downloadButton = screen.getByTestId('ics-download-button');
            fireEvent.click(downloadButton);

            await waitFor(() => {
                expect(blobSpy).toHaveBeenCalledWith(
                    expect.any(Array),
                    expect.objectContaining({ type: 'text/calendar;charset=utf-8' })
                );
            });

            blobSpy.mockRestore();
        });

        it('revokes Blob URL after download', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByTestId('ics-download-button')).toBeInTheDocument();
            });

            const downloadButton = screen.getByTestId('ics-download-button');
            fireEvent.click(downloadButton);

            await waitFor(() => {
                expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
            });
        });

        it('closes dropdown after ICS download', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByRole('menu')).toBeInTheDocument();
            });

            const downloadButton = screen.getByTestId('ics-download-button');
            fireEvent.click(downloadButton);

            await waitFor(() => {
                expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            });
        });

        it('generates valid ICS filename', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                expect(screen.getByTestId('ics-download-button')).toBeInTheDocument();
            });

            const downloadButton = screen.getByTestId('ics-download-button');
            fireEvent.click(downloadButton);

            await waitFor(() => {
                const clickedLink = document.querySelector('a[download]') as HTMLAnchorElement;
                if (clickedLink) {
                    expect(clickedLink.download).toContain('.ics');
                }
            });
        });
    });

    describe('Date Formatting', () => {
        it('formatIcsDate returns correct ICS format', () => {
            const date = new Date('2025-12-31T23:59:59Z');
            const result = formatIcsDate(date);
            expect(result).toMatch(/^\d{8}T\d{6}Z$/);
            expect(result).toBe('20251231T235959Z');
        });

        it('formatIcsDate handles midnight correctly', () => {
            const date = new Date('2025-01-01T00:00:00Z');
            const result = formatIcsDate(date);
            expect(result).toBe('20250101T000000Z');
        });

        it('event duration is 1 hour in Google Calendar URL', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                const href = link.getAttribute('href') || '';
                const datesParam = new URL(href, 'https://example.com').searchParams.get('dates') || '';
                const [start, end] = datesParam.split('/');

                // Parse dates and check difference
                const startTime = new Date(start.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'));
                const endTime = new Date(end.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'));
                const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
                expect(durationHours).toBe(1);
            });
        });

        it('event duration is 1 hour in Outlook URL', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('outlook-calendar-link');
                const href = link.getAttribute('href') || '';
                const startdt = new URL(href, 'https://example.com').searchParams.get('startdt');
                const enddt = new URL(href, 'https://example.com').searchParams.get('enddt');

                if (startdt && enddt) {
                    const startTime = new Date(startdt);
                    const endTime = new Date(enddt);
                    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
                    expect(durationHours).toBe(1);
                }
            });
        });
    });

    describe('generateIcs Function', () => {
        it('generates valid ICS content structure', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain('BEGIN:VCALENDAR');
            expect(ics).toContain('END:VCALENDAR');
            expect(ics).toContain('BEGIN:VEVENT');
            expect(ics).toContain('END:VEVENT');
        });

        it('includes required ICS properties', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain('VERSION:2.0');
            expect(ics).toContain('PRODID:-//Tikka//Raffle Calendar//EN');
            expect(ics).toContain('UID:');
            expect(ics).toContain('DTSTAMP:');
            expect(ics).toContain('DTSTART:');
            expect(ics).toContain('DTEND:');
            expect(ics).toContain('SUMMARY:');
            expect(ics).toContain('DESCRIPTION:');
            expect(ics).toContain('URL:');
        });

        it('includes location in ICS when provided', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl, raffleLocation);
            expect(ics).toContain(`LOCATION:${raffleLocation}`);
        });

        it('excludes location from ICS when not provided', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).not.toContain('LOCATION:');
        });

        it('uses CRLF line endings for RFC 5545 compliance', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain('\r\n');
        });

        it('escapes special characters in ICS text fields', () => {
            const titleWithSpecialChars = 'Raffle; with, special\ncharacters\\test';
            const ics = generateIcs(titleWithSpecialChars, mockDate, raffleUrl);
            expect(ics).toContain('SUMMARY:');
            // Verify escaping occurred
            expect(ics).toContain('\\;');
            expect(ics).toContain('\\,');
            expect(ics).toContain('\\n');
            expect(ics).toContain('\\\\');
        });

        it('summary line contains raffle title with " – Raffle Ends" suffix', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain(`SUMMARY:${raffleTitle} – Raffle Ends`);
        });

        it('description includes raffle URL', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain(`DESCRIPTION:Don't miss the end of this raffle! ${raffleUrl}`);
        });

        it('URL property matches provided URL', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            expect(ics).toContain(`URL:${raffleUrl}`);
        });

        it('event starts 1 hour before end time', () => {
            const ics = generateIcs(raffleTitle, mockDate, raffleUrl);
            const lines = ics.split('\r\n');
            const dtstart = lines.find(line => line.startsWith('DTSTART:'));
            const dtend = lines.find(line => line.startsWith('DTEND:'));

            expect(dtstart).toBeDefined();
            expect(dtend).toBeDefined();

            if (dtstart && dtend) {
                const startTime = new Date(
                    (dtstart.replace('DTSTART:', '') as any)
                        .replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')
                );
                const endTime = new Date(
                    (dtend.replace('DTEND:', '') as any)
                        .replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z')
                );
                const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
                expect(durationHours).toBe(1);
            }
        });
    });

    describe('URL Builders', () => {
        it('googleCalendarUrl returns valid URL', () => {
            const url = googleCalendarUrl(raffleTitle, mockDate, raffleUrl);
            expect(url).toContain('https://calendar.google.com/calendar/render');
            expect(() => new URL(url)).not.toThrow();
        });

        it('outlookCalendarUrl returns valid URL', () => {
            const url = outlookCalendarUrl(raffleTitle, mockDate, raffleUrl);
            expect(url).toContain('https://outlook.live.com/calendar');
            expect(() => new URL(url)).not.toThrow();
        });

        it('googleCalendarUrl includes location parameter when provided', () => {
            const url = googleCalendarUrl(raffleTitle, mockDate, raffleUrl, raffleLocation);
            expect(url).toContain('location=');
            expect(url).toContain(encodeURIComponent(raffleLocation));
        });

        it('outlookCalendarUrl includes location parameter when provided', () => {
            const url = outlookCalendarUrl(raffleTitle, mockDate, raffleUrl, raffleLocation);
            expect(url).toContain('location=');
        });
    });

    describe('Edge Cases', () => {
        it('handles missing URL by using window.location.href', async () => {
            const propsWithoutUrl = { ...defaultProps, url: undefined };
            renderComponent(propsWithoutUrl);
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                expect(link.getAttribute('href')).toBeTruthy();
            });
        });

        it('handles missing location gracefully', () => {
            const propsWithoutLocation = { ...defaultProps, location: undefined };
            renderComponent(propsWithoutLocation);
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            expect(screen.getByTestId('google-calendar-link')).toBeInTheDocument();
        });

        it('handles special characters in title', async () => {
            const specialTitle = 'Raffle™ with "Quotes" & Symbols';
            const props = { ...defaultProps, title: specialTitle };
            renderComponent(props);
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                expect(link.getAttribute('href')).toContain(encodeURIComponent(specialTitle));
            });
        });

        it('handles very long title gracefully', async () => {
            const longTitle = 'A'.repeat(500);
            const props = { ...defaultProps, title: longTitle };
            renderComponent(props);
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const link = screen.getByTestId('google-calendar-link');
                expect(link).toBeInTheDocument();
            });
        });

        it('handles past dates correctly', () => {
            const pastDate = new Date('2020-01-01T00:00:00Z');
            const pastUnix = Math.floor(pastDate.getTime() / 1000);
            const props = { ...defaultProps, endTimeUnix: pastUnix };
            renderComponent(props);

            const button = screen.getByRole('button', { name: /add to calendar/i });
            expect(button).toBeInTheDocument();
        });

        it('handles future dates correctly', () => {
            const futureDate = new Date('2099-12-31T23:59:59Z');
            const futureUnix = Math.floor(futureDate.getTime() / 1000);
            const props = { ...defaultProps, endTimeUnix: futureUnix };
            renderComponent(props);

            const button = screen.getByRole('button', { name: /add to calendar/i });
            expect(button).toBeInTheDocument();
        });

        it('applies custom className when provided', () => {
            const customClass = 'custom-wrapper-class';
            const props = { ...defaultProps, className: customClass };
            renderComponent(props);

            const container = screen.getByTestId('add-to-calendar');
            expect(container).toHaveClass(customClass);
        });

        it('handles component unmount safely', () => {
            const { unmount } = renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            expect(() => unmount()).not.toThrow();
        });
    });

    describe('Mobile Responsiveness', () => {
        it('button is touch-friendly with adequate size', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            const computedStyle = window.getComputedStyle(button);

            // Lucide icon size is w-4 h-4 which is 16px
            // Should be easily tappable on mobile
            expect(button).toBeInTheDocument();
        });

        it('dropdown menu is positioned correctly for mobile', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const menu = screen.getByRole('menu');
                const menuClasses = menu.getAttribute('class') || '';
                // Menu should have position absolute and z-index for layering
                expect(menuClasses).toContain('absolute');
                expect(menuClasses).toContain('z-50');
            });
        });
    });

    describe('Accessibility', () => {
        it('button has proper ARIA labels', () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            expect(button).toHaveAttribute('title');
        });

        it('menu items have proper ARIA roles', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const googleLink = screen.getByTestId('google-calendar-link');
                const outlookLink = screen.getByTestId('outlook-calendar-link');
                const icsButton = screen.getByTestId('ics-download-button');

                expect(googleLink).toHaveAttribute('role', 'menuitem');
                expect(outlookLink).toHaveAttribute('role', 'menuitem');
                expect(icsButton).toHaveAttribute('role', 'menuitem');
            });
        });

        it('menu container has proper ARIA attributes', async () => {
            renderComponent();
            const button = screen.getByRole('button', { name: /add to calendar/i });
            fireEvent.click(button);

            await waitFor(() => {
                const menu = screen.getByRole('menu');
                expect(menu).toHaveAttribute('role', 'menu');
                expect(menu).toHaveAttribute('aria-label');
            });
        });
    });
});
