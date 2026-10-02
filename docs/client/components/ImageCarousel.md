# ImageCarousel Component - Touch Swipe Implementation

## Overview

The ImageCarousel component now supports touch swipe gestures for mobile devices, keyboard navigation, and smooth CSS transitions for an enhanced user experience.

## Features Implemented

### 1. Touch Swipe Navigation
- **Horizontal swipe detection**: Users can swipe left/right to navigate between images
- **Minimum swipe distance**: 50px threshold to prevent accidental navigation
- **Touch event handlers**: 
  - `onTouchStart`: Captures initial touch position
  - `onTouchMove`: Tracks finger movement
  - `onTouchEnd`: Determines swipe direction and triggers navigation

### 2. Keyboard Navigation
- **Arrow keys**: Left/Right arrows navigate through images
- **Context-aware**: Keyboard events are properly scoped between carousel and lightbox
- **Wrap-around**: Navigation wraps from last to first and vice versa

### 3. CSS Transitions
- **Smooth animations**: Added `transition-transform duration-300 ease-in-out` classes
- **Touch optimization**: `touch-pan-y` class allows vertical scrolling while capturing horizontal swipes

### 4. Wrap-Around Navigation
- Swiping left on the last image navigates to the first image
- Swiping right on the first image navigates to the last image
- Same behavior applies to keyboard navigation and click navigation

## Implementation Details

### State Management
```typescript
const [touchStart, setTouchStart] = useState<number | null>(null);
const [touchEnd, setTouchEnd] = useState<number | null>(null);
const carouselRef = useRef<HTMLDivElement>(null);
const minSwipeDistance = 50;
```

### Touch Event Handlers
```typescript
const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
};

const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
};

const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
        handleNext();
    } else if (isRightSwipe) {
        handlePrev();
    }
};
```

### Keyboard Navigation
```typescript
useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (lightboxOpen) return; // Let Lightbox handle keyboard when open
        
        if (e.key === "ArrowLeft") {
            handlePrev();
        } else if (e.key === "ArrowRight") {
            handleNext();
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
}, [currentIndex, lightboxOpen]);
```

## Testing

Comprehensive tests have been added in `ImageCarousel.spec.tsx` covering:

- ✅ Single image mode rendering
- ✅ Multiple images carousel mode
- ✅ Click navigation (buttons, thumbnails, pagination dots)
- ✅ Keyboard navigation (ArrowLeft, ArrowRight)
- ✅ Touch swipe navigation (left/right swipes)
- ✅ Wrap-around navigation (all methods)
- ✅ Lightbox functionality
- ✅ Touch swipe in lightbox
- ✅ Accessibility (ARIA labels)
- ✅ Edge cases (short swipes, no navigation)

### Running Tests

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests with coverage
pnpm test -- --coverage
```

## Browser Compatibility

Touch events are supported in:
- All modern mobile browsers (iOS Safari, Chrome, Firefox)
- Desktop browsers with touch screens
- Graceful fallback to click navigation on non-touch devices

## Accessibility

The component maintains full accessibility support:
- ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader friendly
- Focus management

## Future Enhancements

Potential improvements:
- Visual feedback during swipe (drag animation)
- Configurable swipe threshold
- Momentum-based swiping
- Multi-finger gesture support
