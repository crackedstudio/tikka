/**
 * LazyImage Component
 *
 * Optimized image component with:
 * - Lazy loading (only loads when visible)
 * - Blur-up placeholder effect
 * - Async decoding
 * - Fixed aspect ratio to prevent layout shift
 * - Fallback for browsers without lazy loading support
 * - Deterministic error fallback with telemetry callbacks
 */

import React, { useState, useRef, useEffect } from 'react';
import { generateBlurPlaceholder } from '../utils/imageOptimization';

interface LazyImageProps {
    src: string;
    alt: string;
    className?: string;
    containerClassName?: string;
    /** Aspect ratio as width/height (e.g., 16/9, 1/1, "16/9", or "1" for square) */
    aspectRatio?: number | string;
    /** Whether to use blur-up effect */
    blurUp?: boolean;
    /** Callback when image finishes loading */
    onLoad?: () => void;
    /** Callback on load error (receives the image src for telemetry) */
    onError?: (failedSrc: string) => void;
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

    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(imgRef.current);
        } else {
          ref.current = imgRef.current;
        }
      }
    }, [ref]);

    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      if (!('IntersectionObserver' in window)) {
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
      onError?.(src);
    };

    const containerStyle: React.CSSProperties = {};
    if (aspectRatio !== undefined) {
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
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 p-2">
            <svg
              className="w-8 h-8 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-xs text-center">{alt || 'Image unavailable'}</span>
          </div>
        )}
      </div>
    );
  }
);

LazyImage.displayName = 'LazyImage';

export default LazyImage;
