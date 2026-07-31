import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WifiOff, X, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

/**
 * OfflineBanner
 *
 * Displays a dismissible top-of-page banner whenever the user's browser
 * loses network connectivity. When connectivity returns the banner is
 * automatically hidden and all active TanStack Query queries are invalidated
 * so stale data is immediately refreshed.
 *
 * Acceptance criteria addressed:
 *   ✓ Toggling network off in DevTools shows the banner.
 *   ✓ User can dismiss the banner while offline (it stays dismissed until
 *     the next offline episode).
 *   ✓ Toggling network back on hides the banner and refetches data.
 */
export function OfflineBanner() {
    const { isOnline, isOffline } = useOnlineStatus();
    const queryClient = useQueryClient();
    const [isDismissed, setIsDismissed] = useState(false);
    const wasOfflineRef = useRef(false);
    // Keep a stable ref to queryClient so the effect doesn't re-run when
    // the QueryClient instance changes (e.g. between test renders).
    const queryClientRef = useRef(queryClient);
    queryClientRef.current = queryClient;

    // Track transitions from offline → online so we can trigger a refetch.
    useEffect(() => {
        if (isOffline) {
            wasOfflineRef.current = true;
        }

        if (isOnline && wasOfflineRef.current) {
            wasOfflineRef.current = false;
            // Reset dismissed state so future offline periods show the banner again.
            setIsDismissed(false);
            // Refetch all active queries now that we're back online.
            queryClientRef.current.invalidateQueries();
        }
    }, [isOnline, isOffline]);

    // Don't render anything when online or user has dismissed the banner.
    if (isOnline || isDismissed) return null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            data-testid="offline-banner"
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                zIndex: 10000,
                background: "linear-gradient(90deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
                borderBottom: "1px solid rgba(99, 102, 241, 0.4)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.6rem 1rem",
            }}
        >
            {/* Left — icon + message */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    flex: 1,
                    minWidth: 0,
                }}
            >
                {/* Pulsing wifi-off icon */}
                <span
                    aria-hidden="true"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "50%",
                        backgroundColor: "rgba(239, 68, 68, 0.18)",
                        flexShrink: 0,
                        animation: "offline-pulse 2s ease-in-out infinite",
                    }}
                >
                    <WifiOff
                        size={15}
                        color="#f87171"
                        aria-hidden="true"
                    />
                </span>

                <div style={{ minWidth: 0 }}>
                    <p
                        style={{
                            margin: 0,
                            color: "#e0e7ff",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            letterSpacing: "0.01em",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        You are offline
                    </p>
                    <p
                        style={{
                            margin: 0,
                            color: "#a5b4fc",
                            fontSize: "0.72rem",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        Check your connection — data will refresh automatically when you reconnect.
                    </p>
                </div>
            </div>

            {/* Right — reconnecting indicator + dismiss button */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexShrink: 0,
                }}
            >
                <span
                    aria-hidden="true"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        color: "#818cf8",
                        fontSize: "0.7rem",
                        fontWeight: 500,
                    }}
                >
                    <RefreshCw
                        size={12}
                        style={{ animation: "offline-spin 2.5s linear infinite" }}
                        aria-hidden="true"
                    />
                    Reconnecting…
                </span>

                <button
                    type="button"
                    aria-label="Dismiss offline notification"
                    data-testid="offline-banner-dismiss"
                    onClick={() => setIsDismissed(true)}
                    style={{
                        background: "transparent",
                        border: "1px solid rgba(99,102,241,0.35)",
                        borderRadius: "0.375rem",
                        padding: "0.25rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#a5b4fc",
                        transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = "rgba(99,102,241,0.2)";
                        e.currentTarget.style.color = "#e0e7ff";
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#a5b4fc";
                    }}
                >
                    <X size={14} aria-hidden="true" />
                </button>
            </div>

            {/* Keyframes injected inline for zero dependencies */}
            <style>{`
                @keyframes offline-pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.65; transform: scale(0.92); }
                }
                @keyframes offline-spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default OfflineBanner;
