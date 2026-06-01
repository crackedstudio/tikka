/**
 * LazyImage Component
 *
 * Optimized image component with:
 * - Lazy loading (only loads when visible)
 * - Blur-up placeholder effect
 * - Async decoding
 * - Fixed aspect ratio to prevent layout shift
 * - Deterministic fallback for load failures
 */

import React, { useState, useRef, useEffect } from 'react';
import { generateBlurPlaceholder } from '../utils/imageOptimization';

type LoadHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
type ErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;

interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onLoad' | 'onError'> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  /** Aspect ratio as width/height (e.g., 16/9, 1/1) */
  aspectRatio?: number | string;
  /** Whether to use blur-up effect */
  blurUp?: boolean;
  /** Callback when image finishes loading */
  onLoad?: LoadHandler;
  /** Callback on load error */
  onError?: ErrorHandler;
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
      ...rest
    },
    ref
  ) => {
    const [imageSrc, setImageSrc] = useState<string>(blurUp ? generateBlurPlaceholder() : src);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
      if (!imgRef.current || !ref) return;

      if (typeof ref === 'function') {
        ref(imgRef.current);
      } else {
        (ref as React.MutableRefObject<HTMLImageElement | null>).current = imgRef.current;
      }
    }, [ref]);

    useEffect(() => {
      if (hasError) return;
      const img = imgRef.current;
      if (!img) return;

      if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
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
    }, [src, observerOptions, hasError]);

    useEffect(() => {
      if (blurUp) {
        setImageSrc(generateBlurPlaceholder());
      } else {
        setImageSrc(src);
      }
      setIsLoaded(false);
      setHasError(false);
    }, [src, blurUp]);

    const handleLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const currentSrc = event.currentTarget.currentSrc || event.currentTarget.src;
      if (currentSrc.startsWith('data:')) {
        return;
      }

      setIsLoaded(true);
      onLoad?.(event);
    };

    const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      setHasError(true);
      onError?.(event);
    };

    const containerStyle: React.CSSProperties = {};
    if (aspectRatio !== undefined) {
      containerStyle.aspectRatio = aspectRatio;
    }

    return (
      <div
        data-testid="lazyimage-container"
        className={`overflow-hidden bg-gray-200 dark:bg-gray-700 ${containerClassName}`}
        style={containerStyle}
      >
        {!hasError ? (
          <img
            data-testid="lazyimage-img"
            ref={imgRef}
            src={imageSrc}
            alt={alt}
            className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-75'} transition-opacity duration-300`}
            loading="lazy"
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            {...rest}
          />
        ) : (
          <div
            data-testid="lazyimage-fallback"
            className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-sm"
            role="img"
            aria-label={alt}
          >
            Image unavailable
          </div>
        )}
      </div>
    );
  }
);

LazyImage.displayName = 'LazyImage';

export default LazyImage;
