import { useState, useEffect } from "react";

/**
 * useOnlineStatus
 *
 * Tracks whether the browser currently has network connectivity by listening
 * to the native `online` and `offline` window events alongside the initial
 * value of `navigator.onLine`.
 *
 * The hook is fully side-effect–safe: event listeners are removed when the
 * component that consumes the hook unmounts.
 *
 * @returns {{ isOnline: boolean; isOffline: boolean }}
 *
 * @example
 * const { isOnline, isOffline } = useOnlineStatus();
 * if (isOffline) showBanner();
 */
export function useOnlineStatus(): { isOnline: boolean; isOffline: boolean } {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        // navigator.onLine can be undefined in SSR environments; default to true.
        if (typeof navigator !== "undefined") {
            return navigator.onLine;
        }
        return true;
    });

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return { isOnline, isOffline: !isOnline };
}
