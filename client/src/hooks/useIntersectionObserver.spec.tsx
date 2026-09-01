import { render, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useIntersectionObserver } from './useIntersectionObserver';

// Store original so we can restore it
const OriginalIntersectionObserver = globalThis.IntersectionObserver;

// Helper: component that renders a div wired to the hook ref
function TestComponent({
    onIntersect,
    options,
}: {
    onIntersect: () => void;
    options?: Parameters<typeof useIntersectionObserver>[1];
}) {
    const ref = useIntersectionObserver(onIntersect, options);
    return <div ref={ref} data-testid="target" />;
}

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

        // Ensure IntersectionObserver exists (jsdom doesn't have it)
        if (!OriginalIntersectionObserver) {
            (globalThis as any).IntersectionObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            };
        }

        vi.spyOn(globalThis, 'IntersectionObserver').mockImplementation(
            (cb: IntersectionObserverCallback) => {
                mockObserverCallback = cb;
                return mockObserverInstance as unknown as IntersectionObserver;
            }
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (!OriginalIntersectionObserver) {
            delete (globalThis as any).IntersectionObserver;
        }
    });

    it('should call the callback when element intersects', () => {
        const onIntersect = vi.fn();
        render(<TestComponent onIntersect={onIntersect} />);

        const element = document.querySelector('[data-testid="target"]')!;

        act(() => {
            mockObserverCallback(
                [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        expect(onIntersect).toHaveBeenCalledOnce();
    });

    it('should not call the callback when element is not intersecting', () => {
        const onIntersect = vi.fn();
        render(<TestComponent onIntersect={onIntersect} />);

        const element = document.querySelector('[data-testid="target"]')!;

        act(() => {
            mockObserverCallback(
                [{ isIntersecting: false, target: element } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });

        expect(onIntersect).not.toHaveBeenCalled();
    });

    it('should disconnect observer on unmount', () => {
        const onIntersect = vi.fn();
        const { unmount } = render(<TestComponent onIntersect={onIntersect} />);

        const element = document.querySelector('[data-testid="target"]')!;
        expect(mockObserverInstance.observe).toHaveBeenCalledWith(element);

        unmount();

        expect(mockObserverInstance.disconnect).toHaveBeenCalledOnce();
    });

    it('should honor threshold option', () => {
        const onIntersect = vi.fn();
        const threshold = 0.5;
        render(<TestComponent onIntersect={onIntersect} options={{ threshold }} />);

        expect(globalThis.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ threshold })
        );
    });

    it('should honor rootMargin option', () => {
        const onIntersect = vi.fn();
        const rootMargin = '10px';
        render(<TestComponent onIntersect={onIntersect} options={{ rootMargin }} />);

        expect(globalThis.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ rootMargin })
        );
    });

    it('should not observe when enabled is false', () => {
        const onIntersect = vi.fn();
        render(<TestComponent onIntersect={onIntersect} options={{ enabled: false }} />);

        expect(mockObserverInstance.observe).not.toHaveBeenCalled();
    });

    it('should use default options when not provided', () => {
        const onIntersect = vi.fn();
        render(<TestComponent onIntersect={onIntersect} />);

        expect(globalThis.IntersectionObserver).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({
                threshold: 0,
                rootMargin: '0px',
            })
        );
    });

    it('should update callback reference without re-observing', () => {
        const onIntersect1 = vi.fn();
        const { rerender } = render(<TestComponent onIntersect={onIntersect1} />);

        const element = document.querySelector('[data-testid="target"]')!;

        act(() => {
            mockObserverCallback(
                [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });
        expect(onIntersect1).toHaveBeenCalledOnce();

        // Update callback via rerender
        const onIntersect2 = vi.fn();
        rerender(<TestComponent onIntersect={onIntersect2} />);

        // Should NOT have re-created the observer
        expect(globalThis.IntersectionObserver).toHaveBeenCalledOnce();

        act(() => {
            mockObserverCallback(
                [{ isIntersecting: true, target: element } as IntersectionObserverEntry],
                {} as IntersectionObserver
            );
        });
        expect(onIntersect2).toHaveBeenCalledOnce();
        expect(onIntersect1).toHaveBeenCalledTimes(1); // still only once
    });

    it('should handle multiple entries, calling callback only for intersecting ones', () => {
        const onIntersect = vi.fn();
        render(<TestComponent onIntersect={onIntersect} />);

        const element1 = document.querySelector('[data-testid="target"]')!;
        const element2 = document.createElement('div');

        act(() => {
            mockObserverCallback(
                [
                    { isIntersecting: true, target: element1 } as unknown as IntersectionObserverEntry,
                    { isIntersecting: false, target: element2 } as unknown as IntersectionObserverEntry,
                ],
                {} as IntersectionObserver
            );
        });

        // Should only call once (for the intersecting entry)
        expect(onIntersect).toHaveBeenCalledOnce();
    });
});
