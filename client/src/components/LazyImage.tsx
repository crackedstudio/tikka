/**
 * LazyImage Component
 *
 * Optimized image component with:
 * - Lazy loading (only loads when visible)
 * - Blur-up placeholder effect
 * - Async decoding
 * - Fixed aspect ratio to prevent layout shift
 * - Fallback for browsers without lazy loading support
 */

import React, { useState, useRef, useEffect } from 'react';
import { generateBlurPlaceholder } from '../utils/imageOptimization';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  /** Aspect ratio as width/height (e.g., 16/9, 1/1) */
  aspectRatio?: number;
  /** Whether to use blur-up effect */
  blurUp?: boolean;
  /** Callback when image finishes loading */
  onLoad?: () => void;
  /** Callback on load error */
  onError?: () => void;
  /** Intersection observer options for lazy loading */
  observerOptions?: IntersectionObserverInit;
}

const LazyImage = React.forwardRef<HTMLImageElement, LazyImageProps>(
  (
    {
      src,
      alt,
      className = 'w-full h-full object-cover',
      containerClassName = '',
      aspectRatio,
      blurUp = true,
      onLoad,
      onError,
      observerOptions = { rootMargin: '50px' },
    },
    ref
  ) => {
    const [imageSrc, setImageSrc] = useState<string>(blurUp ? generateBlurPlaceholder() : src);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Merge refs
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(imgRef.current);
        } else {
          ref.current = imgRef.current;
        }
      }
    }, [ref]);

    // Set up intersection observer for lazy loading
    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      // Check if browser supports IntersectionObserver
      if (!('IntersectionObserver' in window)) {
        // Fallback: load immediately
        setImageSrc(src);
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.unobserve(img);
          }
        });
      }, observerOptions);

      observer.observe(img);

      return () => {
        observer.disconnect();
      };
    }, [src, observerOptions]);

    const handleLoad = () => {
      setIsLoaded(true);
      onLoad?.();
    };

    const handleError = () => {
      setHasError(true);
      onError?.();
    };

    const containerStyle: React.CSSProperties = {};
    if (aspectRatio) {
      containerStyle.aspectRatio = `${aspectRatio}`;
    }

    return (
      <div
        ref={containerRef}
        className={`overflow-hidden bg-gray-200 dark:bg-gray-700 ${containerClassName}`}
        style={containerStyle}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-75'} transition-opacity duration-300`}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
        {hasError && (
          <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm">
            Failed to load image
          </div>
        )}
      </div>
    );
  }
);

LazyImage.displayName = 'LazyImage';

export default LazyImage;
