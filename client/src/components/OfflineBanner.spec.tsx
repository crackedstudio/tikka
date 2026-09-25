import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { OfflineBanner } from "./OfflineBanner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setNavigatorOnLine(value: boolean) {
    Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => value,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OfflineBanner", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
    });

    afterEach(() => {
        queryClient.clear();
        vi.restoreAllMocks();
        // restore to online
        setNavigatorOnLine(true);
        window.dispatchEvent(new Event("online"));
    });

    // -----------------------------------------------------------------------
    // Visibility
    // -----------------------------------------------------------------------

    it("does NOT render the banner when the user is online", () => {
        setNavigatorOnLine(true);
        const { container } = render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );
        expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
        expect(container.firstChild).toBeNull();
    });

    it("renders the banner when the user is offline", () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
        expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
    });

    it("shows the banner when network switches from online to offline", () => {
        setNavigatorOnLine(true);
        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();

        act(() => {
            setNavigatorOnLine(false);
            window.dispatchEvent(new Event("offline"));
        });

        expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    });

    it("hides the banner when network switches back to online", async () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

        act(() => {
            setNavigatorOnLine(true);
            window.dispatchEvent(new Event("online"));
        });

        await waitFor(() => {
            expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Dismiss functionality
    // -----------------------------------------------------------------------

    it("hides the banner when the dismiss button is clicked", () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        expect(screen.getByTestId("offline-banner")).toBeInTheDocument();

        fireEvent.click(screen.getByTestId("offline-banner-dismiss"));

        expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
    });

    it("dismiss button has correct aria-label", () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        const dismissBtn = screen.getByTestId("offline-banner-dismiss");
        expect(dismissBtn).toHaveAttribute("aria-label", "Dismiss offline notification");
    });

    // -----------------------------------------------------------------------
    // Data refetch on reconnect
    // -----------------------------------------------------------------------

    it("calls queryClient.invalidateQueries when connectivity is restored", async () => {
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        act(() => {
            setNavigatorOnLine(true);
            window.dispatchEvent(new Event("online"));
        });

        await waitFor(() => {
            expect(invalidateSpy).toHaveBeenCalled();
        });
    });

    it("does NOT call invalidateQueries if we were never offline", () => {
        const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

        setNavigatorOnLine(true);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        // Fire online again without ever going offline
        act(() => {
            window.dispatchEvent(new Event("online"));
        });

        expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it("resets isDismissed state so the banner reappears on the next offline episode", async () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        // Dismiss the banner
        fireEvent.click(screen.getByTestId("offline-banner-dismiss"));
        expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();

        // Come back online (isDismissed should be reset)
        act(() => {
            setNavigatorOnLine(true);
            window.dispatchEvent(new Event("online"));
        });

        // Go offline again — banner should reappear
        act(() => {
            setNavigatorOnLine(false);
            window.dispatchEvent(new Event("offline"));
        });

        await waitFor(() => {
            expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
        });
    });

    // -----------------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------------

    it("banner has role='alert' for screen-reader announcements", () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        const banner = screen.getByTestId("offline-banner");
        expect(banner).toHaveAttribute("role", "alert");
    });

    it("banner has aria-live='assertive' attribute", () => {
        setNavigatorOnLine(false);

        render(
            <QueryClientProvider client={queryClient}>
                <OfflineBanner />
            </QueryClientProvider>,
        );

        act(() => {
            window.dispatchEvent(new Event("offline"));
        });

        const banner = screen.getByTestId("offline-banner");
        expect(banner).toHaveAttribute("aria-live", "assertive");
    });
});
