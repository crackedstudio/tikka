import type { Meta, StoryObj } from "@storybook/react";
import ImageCarousel from "./ImageCarousel";

const sampleImages = [
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&auto=format&fit=crop&q=80",
];

const docsMarkdown = `
# ImageCarousel Component - Touch Swipe Implementation

## Overview
The \`ImageCarousel\` component supports touch swipe gestures for mobile devices, keyboard navigation, and smooth CSS transitions for an enhanced user experience.

## Features Implemented

### 1. Touch Swipe Navigation
- **Horizontal swipe detection**: Users can swipe left/right to navigate between images
- **Minimum swipe distance**: 50px threshold to prevent accidental navigation
- **Touch event handlers**: 
  - \`onTouchStart\`: Captures initial touch position
  - \`onTouchMove\`: Tracks finger movement
  - \`onTouchEnd\`: Determines swipe direction and triggers navigation

### 2. Keyboard Navigation
- **Arrow keys**: Left/Right arrows navigate through images
- **Context-aware**: Keyboard events are properly scoped between carousel and lightbox
- **Wrap-around**: Navigation wraps from last to first and vice versa

### 3. CSS Transitions
- **Smooth animations**: Built with \`transition-transform duration-300 ease-in-out\`
- **Touch optimization**: \`touch-pan-y\` class allows vertical scrolling while capturing horizontal swipes

### 4. Wrap-Around Navigation
- Swiping left on the last image navigates to the first image
- Swiping right on the first image navigates to the last image
- Same behavior applies to keyboard and button navigation

## Accessibility & Compatibility
- Full ARIA labels on all interactive controls (prev/next buttons, thumbnails)
- Accessible lightbox overlay with ESC/close button focus management
- Mobile touch screen support across iOS Safari, Chrome, and Firefox
`;

const meta: Meta<typeof ImageCarousel> = {
  title: "Components/ImageCarousel",
  component: ImageCarousel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: docsMarkdown,
      },
    },
  },
  argTypes: {
    images: { control: "object" },
    alt: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof ImageCarousel>;

export const MultipleImages: Story = {
  args: {
    images: sampleImages,
    alt: "Luxury Watch Collection",
  },
  render: (args) => (
    <div className="max-w-lg mx-auto">
      <ImageCarousel {...args} />
    </div>
  ),
};

export const SingleImage: Story = {
  args: {
    images: [sampleImages[0]],
    alt: "Single Prize Item",
  },
  render: (args) => (
    <div className="max-w-lg mx-auto">
      <ImageCarousel {...args} />
    </div>
  ),
};

export const InCardContainer: Story = {
  args: {
    images: sampleImages.slice(0, 3),
    alt: "Featured Raffle Prize",
  },
  render: (args) => (
    <div className="max-w-md mx-auto border border-gray-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-lg bg-white dark:bg-[#11172E] p-4">
      <div className="mb-3">
        <h3 className="font-bold text-lg text-gray-900 dark:text-white">Rolex Daytona Platinum</h3>
        <p className="text-sm text-gray-500">Raffle #1024</p>
      </div>
      <ImageCarousel {...args} />
    </div>
  ),
};
