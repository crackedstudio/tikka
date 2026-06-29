# AddToCalendar - Quick Start Guide

## Installation

The component is already in your codebase at:
- **Component**: `src/components/ui/AddToCalendar.tsx`
- **Utilities**: `src/utils/calendarUtils.ts`

No additional dependencies needed - uses existing libraries (lucide-react, react-i18next).

## Basic Usage (30 seconds)

```tsx
import AddToCalendar from "@/components/ui/AddToCalendar";

export function RaffleCard() {
    const endTime = Math.floor(new Date('2025-12-31T23:59:59Z').getTime() / 1000);
    
    return (
        <AddToCalendar 
            title="Luxury Watch Raffle"
            endTimeUnix={endTime}
            url="https://tikka.example.com/raffle/123"
        />
    );
}
```

## In RafflePage

```tsx
// Already imported, usage example:
<AddToCalendar 
    title={raffle.title}
    endTimeUnix={Math.floor(new Date(raffle.end_time).getTime() / 1000)}
    url={`https://tikka.example.com/raffle/${raffle.id}`}
    location={raffle.location}
/>
```

## Features

✅ **Google Calendar** - Deep link with pre-filled event
✅ **Outlook Calendar** - Deep link with pre-filled event
✅ **Apple/iCal** - `.ics` file download
✅ **Dark Mode** - Automatic support via Tailwind
✅ **Mobile** - Fully responsive
✅ **Accessible** - WCAG compliant with ARIA labels
✅ **i18n** - Translatable text
✅ **TypeScript** - Fully typed

## Props

```typescript
interface AddToCalendarProps {
    title: string;           // Raffle name (required)
    endTimeUnix: number;     // Unix timestamp in seconds (required)
    url?: string;            // Raffle URL (defaults to window.location.href)
    location?: string;       // Event location (optional)
    className?: string;      // Custom CSS classes (optional)
}
```

## Utility Functions

```tsx
import {
    formatIcsDate,           // Convert Date to ICS format
    generateIcs,             // Generate RFC 5545 ICS content
    googleCalendarUrl,       // Get Google Calendar deep link
    outlookCalendarUrl,      // Get Outlook Calendar deep link
    downloadIcsFile,         // Helper to download ICS file
} from "@/utils/calendarUtils";

// Example: Generate Google Calendar URL
const url = googleCalendarUrl(
    "Raffle Name",
    new Date('2025-12-31T23:59:59Z'),
    "https://tikka.example.com/raffle/123"
);
window.open(url, '_blank');
```

## Common Patterns

### With Custom Styling
```tsx
<AddToCalendar 
    title="Raffle"
    endTimeUnix={endTime}
    url={raffleUrl}
    className="absolute top-0 right-0"
/>
```

### Without Location
```tsx
<AddToCalendar 
    title="Online Raffle"
    endTimeUnix={endTime}
    url={raffleUrl}
/>
```

### From Raffle Data
```tsx
const raffleUrl = `${window.location.origin}/raffle/${raffle.id}`;
const endTimeUnix = Math.floor(new Date(raffle.end_time).getTime() / 1000);

<AddToCalendar 
    title={raffle.title}
    endTimeUnix={endTimeUnix}
    url={raffleUrl}
    location={raffle.location}
/>
```

## What Users See

1. **Button**: "Add to Calendar" with calendar icon
2. **Click button** → Dropdown opens with 3 options
3. **Google Calendar** → Opens Google Calendar in new tab
4. **Outlook Calendar** → Opens Outlook in new tab
5. **Download .ics** → Downloads calendar file for Apple Calendar

## Customization

### Change Button Text (i18n)
Add to your translation files:
```json
{
  "en": {
    "raffle.addToCalendar": "Add to Calendar"
  }
}
```

### Change Styling
Component uses Tailwind CSS. Modify `AddToCalendar.tsx` to customize colors, spacing, etc.

### Extend Functionality
Use utility functions to build custom implementations:
```tsx
const icsContent = generateIcs(title, endDate, url, location);
// Send to backend, email, etc.
```

## Testing

```bash
# Run tests
npm run test -- AddToCalendar.spec.tsx

# Expected: 59 passing tests
```

## Troubleshooting

### Issue: Links don't open
- **Cause**: Popup blocker
- **Solution**: User needs to allow popups

### Issue: iCal doesn't work on iOS
- **Cause**: iOS needs HTTPS URL
- **Solution**: Ensure raffle URL is HTTPS

### Issue: Special characters broken
- **Cause**: URL encoding issue
- **Solution**: Component handles this automatically

### Issue: Wrong timezone
- **Cause**: Different timezone interpretation
- **Solution**: All times are UTC (Z suffix), converted locally by calendar apps

## Files & Documentation

📄 **Component**: `src/components/ui/AddToCalendar.tsx`
📄 **Utilities**: `src/utils/calendarUtils.ts`
📄 **Tests**: `src/components/ui/AddToCalendar.spec.tsx` (59 tests)
📄 **Full Guide**: `src/components/ui/ADDTOCALENDAR_GUIDE.md`
📄 **Examples**: `src/components/ui/AddToCalendar.examples.tsx`
📄 **Implementation**: `ADDTOCALENDAR_IMPLEMENTATION.md`

## Next Steps

1. ✅ Component is ready to use in RafflePage
2. ✅ All tests passing (npm run test)
3. ✅ Full documentation available
4. ✅ No additional setup needed

## Questions?

Refer to the full guide: `src/components/ui/ADDTOCALENDAR_GUIDE.md`

---

**Summary**: The AddToCalendar component is production-ready, fully tested, and documented. Use it to help users save raffle end times to their calendars!
