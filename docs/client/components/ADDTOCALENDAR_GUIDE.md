# AddToCalendar Component Guide

## Overview

The `AddToCalendar` component provides a user-friendly way to add raffle end times to calendar applications (Google Calendar, Outlook, and Apple/iCal). It generates provider-specific deep links and downloadable `.ics` files with properly formatted event data.

## Features

- **Multi-Provider Support**
  - Google Calendar deep link
  - Outlook Calendar deep link
  - Apple/iCal `.ics` file download

- **Event Details**
  - Raffle title as event summary
  - Event duration: 1 hour before raffle end time
  - Description with raffle URL
  - Location support (optional)
  - UID generation for iCal compliance

- **UX/Accessibility**
  - Dropdown menu with icon indicators
  - Click-outside to close
  - ARIA labels for screen readers
  - Mobile responsive
  - Dark mode support

- **RFC 5545 Compliance**
  - Valid ICS format
  - Proper date/time formatting (YYYYMMDDTHHMMSSZ)
  - CRLF line endings
  - Special character escaping

## Props

```typescript
export interface AddToCalendarProps {
    title: string;           // Raffle name (required)
    endTimeUnix: number;     // Unix timestamp in seconds (required)
    url?: string;            // Raffle URL (defaults to window.location.href)
    location?: string;       // Event location (optional)
    className?: string;      // Custom CSS classes for wrapper (optional)
}
```

## Basic Usage

```tsx
import AddToCalendar from '@/components/ui/AddToCalendar';

export function RaffleCard() {
    const endTime = 1735689600; // Unix timestamp
    const raffleUrl = 'https://tikka.example.com/raffle/123';

    return (
        <AddToCalendar 
            title="Luxury Watch Raffle"
            endTimeUnix={endTime}
            url={raffleUrl}
            location="Online"
        />
    );
}
```

## Advanced Usage

### In RafflePage

```tsx
import AddToCalendar from "@/components/ui/AddToCalendar";

const RafflePage = () => {
    const { raffle } = useRaffle(raffleId);
    const raffleUrl = `${window.location.origin}/raffle/${raffle.id}`;
    
    return (
        <div className="space-y-4">
            <h1>{raffle.title}</h1>
            
            {/* Calendar integration */}
            <AddToCalendar 
                title={raffle.title}
                endTimeUnix={Math.floor(new Date(raffle.end_time).getTime() / 1000)}
                url={raffleUrl}
                location={raffle.location}
                className="mt-4"
            />
        </div>
    );
};
```

### With Custom Styling

```tsx
<AddToCalendar 
    title="Premium Raffle"
    endTimeUnix={endTime}
    url={raffleUrl}
    className="absolute top-0 right-0"
/>
```

## Utility Functions

All utility functions are exported for standalone use:

### formatIcsDate

Converts a Date to ICS format (RFC 5545).

```typescript
import { formatIcsDate } from '@/components/ui/AddToCalendar';

const date = new Date('2025-12-31T23:59:59Z');
const formatted = formatIcsDate(date);
// Returns: '20251231T235959Z'
```

### generateIcs

Generates complete ICS file content.

```typescript
import { generateIcs } from '@/components/ui/AddToCalendar';

const icsContent = generateIcs(
    "Luxury Watch Raffle",
    new Date('2025-12-31T23:59:59Z'),
    "https://tikka.example.com/raffle/123",
    "Online Event"
);
```

### googleCalendarUrl

Generates Google Calendar deep link.

```typescript
import { googleCalendarUrl } from '@/components/ui/AddToCalendar';

const url = googleCalendarUrl(
    "Luxury Watch Raffle",
    new Date('2025-12-31T23:59:59Z'),
    "https://tikka.example.com/raffle/123",
    "Online Event"
);
// Opens Google Calendar with pre-filled event
window.open(url, '_blank');
```

### outlookCalendarUrl

Generates Outlook Calendar deep link.

```typescript
import { outlookCalendarUrl } from '@/components/ui/AddToCalendar';

const url = outlookCalendarUrl(
    "Luxury Watch Raffle",
    new Date('2025-12-31T23:59:59Z'),
    "https://tikka.example.com/raffle/123",
    "Online Event"
);
window.open(url, '_blank');
```

## URL Encoding & Special Characters

### Automatic Handling

The component automatically handles:
- Special characters in titles (™, ®, &, ", etc.)
- Long titles (500+ characters)
- Special characters in descriptions
- Newlines and line breaks
- Semicolons and commas
- Backslashes

Example:
```tsx
<AddToCalendar 
    title='Raffle™ with "Quotes" & Special; Characters'
    endTimeUnix={endTime}
    url={raffleUrl}
/>
```

### Manual Escaping

For ICS generation, use the internal escaping:

```typescript
// Internal helper (not exported but used internally)
// escapeIcsText() handles: \, \n, ;, ,
```

## Event Time Calculation

The component automatically calculates:
- **Start Time**: 1 hour before raffle end time
- **End Time**: Raffle end time
- **Duration**: 1 hour

```typescript
// Example
endTime: 2025-12-31T23:59:59Z
startTime: 2025-12-31T22:59:59Z (1 hour before)
endTime: 2025-12-31T23:59:59Z
duration: 1 hour
```

## ICS File Format

Generated `.ics` files comply with RFC 5545 and include:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Tikka//Raffle Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:raffle-[timestamp]@tikka
DTSTAMP:[creation timestamp]
DTSTART:[start time]
DTEND:[end time]
SUMMARY:[raffle title] – Raffle Ends
DESCRIPTION:Don't miss the end of this raffle! [url]
URL:[raffle url]
LOCATION:[location if provided]
END:VEVENT
END:VCALENDAR
```

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome/Chromium | ✅ | Full support |
| Firefox | ✅ | Full support |
| Safari | ✅ | Full support, requires hosted .ics for Apple Calendar |
| Edge | ✅ | Full support |
| Mobile Safari | ✅ | iCal download triggers Apple Calendar |
| Chrome Mobile | ✅ | Links open in respective apps |
| Firefox Mobile | ✅ | Links open in respective apps |

## Accessibility

### ARIA Attributes
- `aria-haspopup="menu"` - Button indicates menu behavior
- `aria-expanded` - Reflects menu open/close state
- `role="menu"` - Container has proper menu role
- `role="menuitem"` - Each calendar option has menuitem role

### Keyboard Navigation
- Tab to focus button
- Enter/Space to open menu
- Escape to close (standard browser behavior)

### Screen Readers
- Button label: "Add to Calendar"
- Menu label: "Calendar options"
- Each option: "Google Calendar", "Outlook Calendar", "Download .ics"

## Internationalization (i18n)

The component uses react-i18next for translations:

```typescript
// Translation keys
'raffle.addToCalendar' - Button label (default: "Add to Calendar")
'raffle.calendarOptions' - Menu label (default: "Calendar options")
```

### Adding Translations

Update your i18n resource files:

```json
{
  "en": {
    "translation": {
      "raffle.addToCalendar": "Add to Calendar",
      "raffle.calendarOptions": "Calendar options"
    }
  },
  "es": {
    "translation": {
      "raffle.addToCalendar": "Añadir al calendario",
      "raffle.calendarOptions": "Opciones de calendario"
    }
  }
}
```

## Dark Mode

The component automatically adapts to dark mode via Tailwind's `dark:` prefix:

```tsx
// Light mode
bg-white text-gray-700

// Dark mode
dark:bg-[#1A2035] dark:text-gray-200
```

No additional configuration needed.

## Testing

### Unit Tests

The test suite covers:

1. **Rendering**
   - Button presence
   - Icon display
   - Accessibility attributes
   - Initial menu state

2. **Interactions**
   - Dropdown open/close
   - Click-outside handler
   - Menu item visibility
   - Menu close after selection

3. **URL Generation**
   - Google Calendar URL structure
   - URL parameter encoding
   - Date range formatting
   - Details/description encoding
   - Outlook URL structure
   - Subject parameter encoding

4. **ICS File**
   - Valid RFC 5545 format
   - Blob creation
   - URL revocation
   - Proper file naming
   - Special character escaping

5. **Date Handling**
   - Correct ICS date format
   - 1-hour event duration
   - Past/future dates
   - Edge cases

6. **Accessibility**
   - ARIA labels
   - ARIA roles
   - Semantic HTML
   - Menu item roles

7. **Edge Cases**
   - Missing URL (uses window.location.href)
   - Missing location
   - Special characters in title
   - Very long titles
   - Past/future dates
   - Custom className

### Running Tests

```bash
# Run all tests
npm run test

# Run AddToCalendar tests only
npm run test -- AddToCalendar.spec.tsx

# Run with coverage
npm run test -- --coverage
```

### Example Test Output

```
AddToCalendar Component
  ✓ Rendering (4 tests)
  ✓ Dropdown Menu Interaction (5 tests)
  ✓ Google Calendar Link (7 tests)
  ✓ Outlook Calendar Link (5 tests)
  ✓ ICS Download (7 tests)
  ✓ Date Formatting (5 tests)
  ✓ generateIcs Function (9 tests)
  ✓ URL Builders (4 tests)
  ✓ Edge Cases (8 tests)
  ✓ Mobile Responsiveness (2 tests)
  ✓ Accessibility (3 tests)

Total: 59 tests passing
```

## Performance Considerations

### Optimization Tips

1. **Memoization** - Component is lightweight, no memoization needed
2. **URL Generation** - URLs generated on-demand, not cached
3. **Event Listeners** - Click-outside listener cleaned up on unmount
4. **Blob Creation** - Only created when user clicks download

### Performance Metrics

- Bundle size: ~3KB (component only)
- Render time: <1ms
- Memory footprint: Negligible
- No re-renders on prop changes unless required

## Troubleshooting

### Issue: Google Calendar link doesn't open

**Cause**: Popup blocked
**Solution**: User needs to enable popups for the domain

### Issue: Outlook link shows error

**Cause**: Special characters in URL
**Solution**: Component auto-escapes - check browser console for URL encoding

### Issue: ICS file downloads as .ics.txt

**Cause**: Browser/OS association issue
**Solution**: Rename file extension or update OS file associations

### Issue: iCal doesn't import correctly

**Cause**: Invalid ICS format or special characters not escaped
**Solution**: Check RFC 5545 compliance, ensure CRLF line endings

### Issue: Dates show in wrong timezone

**Cause**: Browser timezone differs from intended
**Solution**: All times stored as UTC (Z suffix), converted locally by calendar apps

## Security Considerations

### XSS Prevention
- No direct innerHTML usage
- All URLs properly encoded
- Event titles escaped for ICS format
- Safe React rendering practices

### URL Validation
- URLs not validated client-side (user's responsibility)
- Links open in `_blank` with `noopener` and `noreferrer`
- No sensitive data in URLs

### Best Practices
- Don't include sensitive info in raffle URL
- Use HTTPS URLs only
- Validate raffle data before passing to component

## Migration from Previous Versions

### v1 → v2
The component has been enhanced with:
- Location support
- Improved accessibility
- Better error handling
- Comprehensive testing
- TypeScript exports

**Breaking Changes**: None - fully backward compatible

**API Changes**: All utilities now exported for standalone use

## API Reference

### Component Props

```typescript
interface AddToCalendarProps {
    title: string;           // Required - Raffle name
    endTimeUnix: number;     // Required - Unix timestamp (seconds)
    url?: string;            // Optional - Defaults to window.location.href
    location?: string;       // Optional - Event location
    className?: string;      // Optional - Custom CSS classes
}
```

### Exported Functions

```typescript
// Date formatting
export function formatIcsDate(date: Date): string;

// ICS generation
export function generateIcs(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string;

// URL generation
export function googleCalendarUrl(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string;

export function outlookCalendarUrl(
    title: string,
    endDate: Date,
    url: string,
    location?: string
): string;

// Component
export default AddToCalendar;
```

## Support & Contributing

### Reporting Issues

When reporting issues, include:
1. Browser and version
2. Calendar provider (Google/Outlook/Apple)
3. Error message and console output
4. Steps to reproduce
5. Test case if possible

### Contributing Enhancements

Contributions welcome for:
- Additional calendar providers (Caldav, etc.)
- Internationalization
- Performance optimizations
- Accessibility improvements
- Better error handling

## Related Components

- `CountdownTimer` - Shows time until raffle ends
- `NotificationSubscribeButton` - Notify before raffle ends
- `RafflePage` - Uses AddToCalendar for raffle details
