/**
 * Image optimization utilities for lazy loading and blur-up effects
 */

/**
 * Generate a minimal base64 placeholder for blur-up effect
 * Creates a 1x1 pixel placeholder that can be used as initial src
 */
export function generateBlurPlaceholder(color: string = '#e5e7eb'): string {
  // Create a 1x1 pixel SVG with the specified color
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="${color}" width="1" height="1"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Generate a low-resolution placeholder from a full image URL
 * This is a simple approach that returns a placeholder while the full image loads
 */
export function getImagePlaceholder(_fullUrl: string): string {
  // For now, return a simple color placeholder
  // In production, you could use a service like Cloudinary or Imgix
  // to generate actual low-res versions
  return generateBlurPlaceholder();
}

/**
 * Preload an image and return a promise that resolves when loaded
 */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Check if the browser supports lazy loading
 */
export function supportsLazyLoading(): boolean {
  return 'loading' in HTMLImageElement.prototype;
}

/**
 * Check if the browser supports decoding attribute
 */
export function supportsAsyncDecoding(): boolean {
  return 'decoding' in HTMLImageElement.prototype;
}
