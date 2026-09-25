# Multi-Image Support for Raffles

## Overview
This feature adds support for multiple images per raffle, allowing creators to showcase physical prizes from different angles and perspectives. This is particularly useful for high-value physical items where buyers want to see detailed views.

## Changes Made

### Backend Changes

#### 1. Database Schema (`backend/database/migrations/004_multi_image_support.sql`)
- Added `image_urls` column (TEXT[]) to `raffle_metadata` table
- Maintains backward compatibility with existing `image_url` column
- Added GIN index for efficient array queries

#### 2. Metadata Schema (`backend/src/api/rest/raffles/metadata.schema.ts`)
- Added `image_urls` field (array of strings, nullable, optional)
- Keeps `image_url` for backward compatibility

### Frontend Changes

#### 1. Type Definitions (`client/src/types/types.ts`)
- Updated `RaffleFormData` to include `images: File[]` array
- Updated `RaffleMetadata` to include optional `images?: string[]` array
- Maintains `image` field for primary/legacy support

#### 2. Create Raffle Form (`client/src/components/create-raffle/ImageStep.tsx`)
- Complete rewrite to support multiple image uploads
- Features:
  - Drag & drop multiple files
  - Click to upload multiple files
  - Image gallery with thumbnails
  - Set primary image functionality
  - Remove individual images
  - Visual indicators for primary image
  - Hover effects for image management

#### 3. Image Carousel Component (`client/src/components/ImageCarousel.tsx`)
- New component using Swiper library
- Features:
  - Main image carousel with navigation
  - Thumbnail strip for quick navigation
  - Full-screen lightbox view
  - Keyboard navigation (arrows, escape)
  - Touch/swipe support on mobile
  - Responsive design
  - Image counter display
  - Optimized loading

#### 4. Raffle Details Card (`client/src/components/cards/RaffleDetailsCard.tsx`)
- Updated to accept `images?: string[]` prop
- Integrates ImageCarousel component
- Falls back to single image if no array provided

#### 5. Raffle Details Page (`client/src/pages/RaffleDetails.tsx`)
- Passes `images` array from metadata to RaffleDetailsCard
- Maintains backward compatibility with single image

#### 6. Live Preview (`client/src/components/create-raffle/LivePreview.tsx`)
- Shows primary image with thumbnail strip
- Displays "+N" indicator for additional images
- Responsive preview of multi-image raffles

#### 7. Dependencies (`client/package.json`)
- Added `swiper: ^11.1.14` for carousel functionality

## Usage

### Creating a Raffle with Multiple Images

1. Navigate to Create Raffle page
2. On the Image step:
   - Drag & drop multiple images, or
   - Click to select multiple files
3. Manage uploaded images:
   - Click "Set Primary" to change the main image
   - Click X button to remove an image
   - First uploaded image is primary by default
4. Continue with raffle creation

### Viewing Multi-Image Raffles

1. Navigate to raffle details page
2. If multiple images exist:
   - Main carousel shows current image
   - Thumbnail strip below for navigation
   - Click arrows or thumbnails to navigate
   - Click any image to open lightbox
3. In lightbox:
   - Use arrows or keyboard to navigate
   - Click thumbnails to jump to specific image
   - Press ESC or click X to close

## Backward Compatibility

- Existing raffles with single `image_url` continue to work
- Single images display without carousel UI
- API accepts both `image_url` and `image_urls`
- Frontend gracefully handles missing `images` array

## Image Loading Optimization

1. Lazy loading for carousel images
2. Thumbnail generation for quick preview
3. Progressive loading in lightbox
4. Swiper's built-in optimization features

## Responsive Design

- Mobile: Stacked layout, touch-friendly controls
- Tablet: Optimized carousel size
- Desktop: Full carousel with hover effects
- Lightbox: Adapts to screen size

## Browser Support

- Modern browsers with ES6+ support
- Touch events for mobile devices
- Keyboard navigation for accessibility
- Fallback for browsers without advanced features

## Future Enhancements

1. Image compression before upload
2. CDN integration for faster loading
3. Image zoom functionality
4. Video support
5. 360° view for products
6. AI-powered image quality checks
7. Automatic thumbnail generation
8. Image reordering via drag & drop

## Testing Recommendations

1. Test with 1, 3, 5, and 10+ images
2. Test various image sizes and formats
3. Test on mobile, tablet, and desktop
4. Test keyboard navigation
5. Test with slow network connections
6. Test backward compatibility with old raffles
7. Test image removal and reordering

## Performance Considerations

- Limit maximum images per raffle (suggested: 10)
- Implement image size limits (suggested: 5MB per image)
- Use lazy loading for thumbnails
- Consider image compression on upload
- Use CDN for production deployments

## Security Considerations

- Validate file types on upload
- Scan for malicious content
- Limit file sizes
- Sanitize file names
- Use secure storage (Supabase/IPFS)
