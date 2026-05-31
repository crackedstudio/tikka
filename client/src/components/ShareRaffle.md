# ShareRaffle Component

## Overview

The `ShareRaffle` component provides a comprehensive sharing interface for raffle links across multiple platforms. It detects Web Share API support and gracefully falls back to clipboard functionality for browsers that don't support native sharing.

## Features

### Web Share API Support
- Detects native Web Share API availability
- Renders a "Share" button only when supported
- Handles user cancellation (AbortError) gracefully
- Shows error toast on share failures

### Clipboard Fallback
- Uses modern Clipboard API when available in secure contexts (HTTPS)
- Falls back to `document.execCommand('copy')` for legacy browsers or non-HTTPS contexts
- Provides success/failure feedback via toast notifications
- Shows temporary "Copied!" state on the button

### URL Generation
- Generates canonical raffle URLs with UTM parameters for tracking
- Supports different UTM sources: `twitter`, `telegram`, `native`, `copy`
- Base URL format: `/raffles/{raffleId}?utm_medium=social&utm_campaign=raffle_share&utm_source={source}`

### Social Sharing
- **Twitter/X**: Opens Twitter intent with pre-filled text and URL
- **Telegram**: Opens Telegram share dialog with URL and text
- Both open in new tabs with proper security attributes

### QR Code
- Generates QR code pointing to the raffle URL
- Allows downloading QR code as PNG image
- Renders at 2× resolution for sharper prints

### Accessibility
- Proper ARIA labels on all interactive elements
- Semantic HTML with role attributes
- Keyboard accessible buttons and links

## Props

```typescript
type ShareRaffleProps = {
  raffleId: number;      // The ID of the raffle to share
  title: string;         // The title of the raffle (used in share text)
};
```

## Usage

```tsx
import ShareRaffle from './ShareRaffle';

export function RaffleDetail() {
  return (
    <ShareRaffle raffleId={123} title="Amazing Prize Raffle" />
  );
}
```

## Implementation Details

### Web Share API Detection
```typescript
const canWebShare =
  typeof navigator !== "undefined" &&
  typeof navigator.share === "function";
```

### Clipboard Copy Strategy
1. Try Clipboard API if available and in secure context
2. Fall back to `execCommand('copy')` if Clipboard API fails
3. Show error if both methods fail

### URL Building
The `buildRaffleShareUrl` function constructs URLs with proper UTM parameters:
- `utm_medium=social` - Indicates social sharing channel
- `utm_campaign=raffle_share` - Campaign identifier
- `utm_source={source}` - Specific sharing method

## Testing

The component includes comprehensive test coverage:

### Test Categories
- **Web Share API support detection**: Verifies button visibility based on API availability
- **Native share functionality**: Tests navigator.share calls and error handling
- **Clipboard copy functionality**: Tests both Clipboard API and execCommand fallback
- **URL generation**: Verifies UTM parameters and canonical URLs
- **QR code functionality**: Tests QR code rendering and download
- **Social share links**: Verifies Twitter and Telegram links
- **Accessibility**: Tests ARIA labels and semantic HTML
- **Component rendering**: Tests overall component structure

### Running Tests
```bash
cd client
npm run test -- ShareRaffle.spec.tsx --run
```

## Browser Support

| Feature | Support |
|---------|---------|
| Web Share API | Chrome 61+, Edge 79+, Safari 13.1+, Firefox 71+ |
| Clipboard API | Chrome 63+, Edge 79+, Safari 13.1+, Firefox 63+ |
| execCommand('copy') | All modern browsers |
| QR Code Generation | All modern browsers |

## Error Handling

- **Share cancelled by user**: Silently ignored (AbortError)
- **Share failed**: Shows error toast "Sharing was cancelled or failed."
- **Clipboard copy failed**: Falls back to execCommand
- **Both copy methods fail**: Shows error toast "Could not copy link"

## Styling

The component uses Tailwind CSS with a dark mode aware design:
- Primary color: `#00E6CC` (teal)
- Background: `#090E1F` (dark blue)
- Responsive layout: Stacks on mobile, side-by-side on desktop

## Dependencies

- `react`: UI framework
- `lucide-react`: Icons (Share2, Link2, Download, Twitter)
- `qrcode.react`: QR code generation
- `sonner`: Toast notifications
