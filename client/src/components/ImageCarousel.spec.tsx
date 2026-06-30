import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageCarousel from './ImageCarousel';

// Mock LazyImage component
vi.mock('./LazyImage', () => ({
  default: ({ src, alt, onClick, className }: any) => (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      className={className}
      data-testid="lazy-image"
    />
  ),
}));

// Mock imageOptimization utility
vi.mock('../utils/imageOptimization', () => ({
  generateBlurPlaceholder: vi.fn(() => 'data:image/png;base64,mock'),
}));

describe('ImageCarousel', () => {
  const mockImages = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Single Image Mode', () => {
    it('should render a single image without carousel controls', () => {
      render(<ImageCarousel images={[mockImages[0]]} alt="Test Prize" />);

      const images = screen.getAllByRole('img');
      expect(images.length).toBe(1);
      expect(screen.queryByLabelText('Previous image')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Next image')).not.toBeInTheDocument();
    });

    it('should open lightbox when single image is clicked', () => {
      render(<ImageCarousel images={[mockImages[0]]} alt="Test Prize" />);

      const image = screen.getByRole('img', { name: 'Test Prize' });
      fireEvent.click(image);

      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });
  });

  describe('Multiple Images Mode', () => {
    it('should render carousel with navigation buttons', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByLabelText('Previous image')).toBeInTheDocument();
      expect(screen.getByLabelText('Next image')).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should display all thumbnails', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByLabelText('Thumbnail 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Thumbnail 2')).toBeInTheDocument();
      expect(screen.getByLabelText('Thumbnail 3')).toBeInTheDocument();
    });

    it('should display pagination dots', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByLabelText('Go to image 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Go to image 2')).toBeInTheDocument();
      expect(screen.getByLabelText('Go to image 3')).toBeInTheDocument();
    });
  });

  describe('Click Navigation', () => {
    it('should navigate to next image when next button is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      const nextButton = screen.getByLabelText('Next image');
      fireEvent.click(nextButton);

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('should navigate to previous image when previous button is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const nextButton = screen.getByLabelText('Next image');
      fireEvent.click(nextButton);
      expect(screen.getByText('2 / 3')).toBeInTheDocument();

      const prevButton = screen.getByLabelText('Previous image');
      fireEvent.click(prevButton);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should wrap around from last to first image', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const nextButton = screen.getByLabelText('Next image');
      fireEvent.click(nextButton);
      fireEvent.click(nextButton);
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      fireEvent.click(nextButton);
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should wrap around from first to last image', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      const prevButton = screen.getByLabelText('Previous image');
      fireEvent.click(prevButton);

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
    });

    it('should navigate to specific image when thumbnail is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const thumbnail3 = screen.getByLabelText('Thumbnail 3');
      fireEvent.click(thumbnail3);

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
    });

    it('should navigate to specific image when pagination dot is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const dot2 = screen.getByLabelText('Go to image 2');
      fireEvent.click(dot2);

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate to next image when ArrowRight is pressed', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('should navigate to previous image when ArrowLeft is pressed', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const nextButton = screen.getByLabelText('Next image');
      fireEvent.click(nextButton);
      expect(screen.getByText('2 / 3')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should wrap around with keyboard navigation', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      // Wrap from last to first
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      // Wrap from first to last
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('3 / 3')).toBeInTheDocument();
    });

    it('should not navigate when lightbox is open', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      // Open lightbox
      const mainImage = screen.getByAltText('Test Prize 1');
      fireEvent.click(mainImage);

      const lightboxCounter = screen.getByText('1 / 3');
      expect(lightboxCounter).toBeInTheDocument();

      // Keyboard should be handled by lightbox, not carousel
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Lightbox should handle the navigation
      waitFor(() => {
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
      });
    });
  });

  describe('Touch Swipe Navigation', () => {
    it('should navigate to next image on left swipe', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      const carousel = screen.getByAltText('Test Prize 1').parentElement?.parentElement?.parentElement;
      expect(carousel).toBeDefined();

      // Simulate left swipe (swipe from right to left)
      fireEvent.touchStart(carousel!, { targetTouches: [{ clientX: 200 }] });
      fireEvent.touchMove(carousel!, { targetTouches: [{ clientX: 100 }] });
      fireEvent.touchEnd(carousel!);

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('should navigate to previous image on right swipe', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const nextButton = screen.getByLabelText('Next image');
      fireEvent.click(nextButton);
      expect(screen.getByText('2 / 3')).toBeInTheDocument();

      const carousel = screen.getByAltText('Test Prize 2').parentElement?.parentElement?.parentElement;
      expect(carousel).toBeDefined();

      // Simulate right swipe (swipe from left to right)
      fireEvent.touchStart(carousel!, { targetTouches: [{ clientX: 100 }] });
      fireEvent.touchMove(carousel!, { targetTouches: [{ clientX: 200 }] });
      fireEvent.touchEnd(carousel!);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should not navigate if swipe distance is too short', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByText('1 / 3')).toBeInTheDocument();

      const carousel = screen.getByAltText('Test Prize 1').parentElement?.parentElement?.parentElement;
      expect(carousel).toBeDefined();

      // Simulate short swipe (less than 50px threshold)
      fireEvent.touchStart(carousel!, { targetTouches: [{ clientX: 100 }] });
      fireEvent.touchMove(carousel!, { targetTouches: [{ clientX: 80 }] });
      fireEvent.touchEnd(carousel!);

      // Should still be on first image
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('should wrap around on swipe navigation', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const carousel = screen.getByAltText('Test Prize 1').parentElement?.parentElement?.parentElement;
      expect(carousel).toBeDefined();

      // Swipe to last image by going backward from first
      fireEvent.touchStart(carousel!, { targetTouches: [{ clientX: 100 }] });
      fireEvent.touchMove(carousel!, { targetTouches: [{ clientX: 200 }] });
      fireEvent.touchEnd(carousel!);

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
    });
  });

  describe('Lightbox', () => {
    it('should open lightbox when main image is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const mainImage = screen.getByAltText('Test Prize 1');
      fireEvent.click(mainImage);

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should close lightbox when close button is clicked', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const mainImage = screen.getByAltText('Test Prize 1');
      fireEvent.click(mainImage);

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      waitFor(() => {
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
      });
    });

    it('should close lightbox when Escape key is pressed', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const mainImage = screen.getByAltText('Test Prize 1');
      fireEvent.click(mainImage);

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });

      waitFor(() => {
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
      });
    });

    it('should support touch swipe in lightbox', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      const mainImage = screen.getByAltText('Test Prize 1');
      fireEvent.click(mainImage);

      const lightbox = screen.getByRole('button', { name: /close/i }).parentElement;
      expect(lightbox).toBeDefined();

      // Simulate left swipe in lightbox
      fireEvent.touchStart(lightbox!, { targetTouches: [{ clientX: 200 }] });
      fireEvent.touchMove(lightbox!, { targetTouches: [{ clientX: 100 }] });
      fireEvent.touchEnd(lightbox!);

      waitFor(() => {
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels on navigation buttons', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByLabelText('Previous image')).toBeInTheDocument();
      expect(screen.getByLabelText('Next image')).toBeInTheDocument();
    });

    it('should have proper ARIA labels on thumbnails', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      mockImages.forEach((_, index) => {
        expect(screen.getByLabelText(`Thumbnail ${index + 1}`)).toBeInTheDocument();
      });
    });

    it('should have proper ARIA labels on pagination dots', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      mockImages.forEach((_, index) => {
        expect(screen.getByLabelText(`Go to image ${index + 1}`)).toBeInTheDocument();
      });
    });

    it('should have descriptive alt text for images', () => {
      render(<ImageCarousel images={mockImages} alt="Test Prize" />);

      expect(screen.getByAltText('Test Prize 1')).toBeInTheDocument();
    });
  });
});
