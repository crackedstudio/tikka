import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useIntersectionObserver } from './useIntersectionObserver';

describe('useIntersectionObserver', () => {
    let mockObserverCallback: IntersectionObserverCallback;
    let mockObserverInstance: {
        observe: ReturnType<typeof vi.fn>;
        unobserve: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        mockObserverCallback = vi.fn();
        mockObserverInstance = {
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        };

        vi.spyOn(window, 'IntersectionObserver').mockImplementation(
            (callback: IntersectionObserverCallback) => {
                mockObserverCallback = callback;
                return mockObserverInstance as unknown as IntersectionObserver;
            }
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should call the callback when element intersects', () => {
        const onIntersect = vi.fn();
        const { result } = renderHook(() => useIntersectionObserver(onIntersect));

        // Simulate the ref being set
        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // Trigger the observer callback with intersecting entry
        mockObserverCallback([
            { isIntersecting: true, target: element } as IntersectionObserverEntry,
        ] as IntersectionObserverEntry[]);

        expect(onIntersect).toHaveBeenCalledOnce();
    });

    it('should not call the callback when element is not intersecting', () => {
        const onIntersect = vi.fn();
        const { result } = renderHook(() => useIntersectionObserver(onIntersect));

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // Trigger the observer callback with non-intersecting entry
        mockObserverCallback([
            { isIntersecting: false, target: element } as IntersectionObserverEntry,
        ] as IntersectionObserverEntry[]);

        expect(onIntersect).not.toHaveBeenCalled();
    });

    it('should disconnect observer on unmount', () => {
        const onIntersect = vi.fn();
        const { result, unmount } = renderHook(() => useIntersectionObserver(onIntersect));

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        expect(mockObserverInstance.observe).toHaveBeenCalledWith(element);

        unmount();

        expect(mockObserverInstance.disconnect).toHaveBeenCalledOnce();
    });

    it('should honor threshold option', () => {
        const onIntersect = vi.fn();
        const threshold = 0.5;
        const { result } = renderHook(() =>
            useIntersectionObserver(onIntersect, { threshold })
        );

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // Verify IntersectionObserver was called with correct threshold
        expect(window.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ threshold })
        );
    });

    it('should honor rootMargin option', () => {
        const onIntersect = vi.fn();
        const rootMargin = '10px';
        const { result } = renderHook(() =>
            useIntersectionObserver(onIntersect, { rootMargin })
        );

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // Verify IntersectionObserver was called with correct rootMargin
        expect(window.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ rootMargin })
        );
    });

    it('should not observe when enabled is false', () => {
        const onIntersect = vi.fn();
        const { result } = renderHook(() =>
            useIntersectionObserver(onIntersect, { enabled: false })
        );

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        expect(mockObserverInstance.observe).not.toHaveBeenCalled();
    });

    it('should use default options when not provided', () => {
        const onIntersect = vi.fn();
        const { result } = renderHook(() => useIntersectionObserver(onIntersect));

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // Verify IntersectionObserver was called with default options
        expect(window.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                threshold: 0,
                rootMargin: '0px',
            })
        );
    });

    it('should update callback reference without re-observing', () => {
        const onIntersect1 = vi.fn();
        const { result, rerender } = renderHook(
            ({ callback }) => useIntersectionObserver(callback),
            { initialProps: { callback: onIntersect1 } }
        );

        const element = document.createElement('div');
        if (result.current) {
            result.current.current = element;
        }

        // First callback should be called
        mockObserverCallback([
            { isIntersecting: true, target: element } as IntersectionObserverEntry,
        ] as IntersectionObserverEntry[]);
        expect(onIntersect1).toHaveBeenCalledOnce();

        // Update callback
        const onIntersect2 = vi.fn();
        rerender({ callback: onIntersect2 });

        // Reset call count
        vi.clearAllMocks();

        // Second callback should be called
        mockObserverCallback([
            { isIntersecting: true, target: element } as IntersectionObserverEntry,
        ] as IntersectionObserverEntry[]);
        expect(onIntersect2).toHaveBeenCalledOnce();
        expect(onIntersect1).not.toHaveBeenCalled();
    });

    it('should handle multiple entries, calling callback only for intersecting ones', () => {
        const onIntersect = vi.fn();
        const { result } = renderHook(() => useIntersectionObserver(onIntersect));

        const element1 = document.createElement('div');
        const element2 = document.createElement('div');

        if (result.current) {
            result.current.current = element1;
        }

        // Trigger with multiple entries
        mockObserverCallback([
            { isIntersecting: true, target: element1 } as IntersectionObserverEntry,
            { isIntersecting: false, target: element2 } as IntersectionObserverEntry,
        ] as IntersectionObserverEntry[]);

        // Should only call once (for the intersecting entry)
        expect(onIntersect).toHaveBeenCalledOnce();
    });
});
