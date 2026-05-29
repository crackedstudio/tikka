import { useEffect, useRef } from "react";

type UseIntersectionObserverOptions = {
    threshold?: number;
    rootMargin?: string;
    enabled?: boolean;
};

/**
 * Reusable hook wrapping IntersectionObserver.
 * Calls `onIntersect` when the target element enters the viewport.
 */
export function useIntersectionObserver(
    onIntersect: () => void,
    options: UseIntersectionObserverOptions = {}
) {
    const { threshold = 0, rootMargin = "0px", enabled = true } = options;
    const targetRef = useRef<HTMLDivElement | null>(null);
    const callbackRef = useRef(onIntersect);

    // Keep callback ref up-to-date without re-triggering effect
    useEffect(() => {
        callbackRef.current = onIntersect;
    }, [onIntersect]);

    useEffect(() => {
        if (!enabled) return;
        const node = targetRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        callbackRef.current();
                    }
                });
            },
            { threshold, rootMargin }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [enabled, threshold, rootMargin]);

    return targetRef;
}
