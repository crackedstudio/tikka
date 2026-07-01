/**
 * NotificationPreferencesSection Tests
 *
 * Tests for section rendering and failed preference saves.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationPreferencesSection from "./NotificationPreferencesSection";
import * as hooks from "../../hooks/useUserSubscriptions";

// Mock hook
vi.mock("../../hooks/useUserSubscriptions", () => ({
    useUserSubscriptions: vi.fn(),
}));

describe("NotificationPreferencesSection", () => {
    it("renders section header", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByText("Notification Preferences")).toBeInTheDocument();
    });

    it("displays active subscriptions label", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByText(/Active Subscriptions/)).toBeInTheDocument();
    });

    it("shows empty state when no subscriptions", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByText("No active subscriptions")).toBeInTheDocument();
    });

    it("shows hint text about subscribing", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByText(/Visit a raffle and click "Notify Me"/i)).toBeInTheDocument();
    });

    it("displays info about notification types", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByText(/Notifications are sent when a raffle ends/i)).toBeInTheDocument();
    });

    it("displays error message when error state is set", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: false,
            error: "Failed to load subscriptions",
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        expect(screen.getByTestId("error-message")).toBeInTheDocument();
        expect(screen.getByText("Failed to load subscriptions")).toBeInTheDocument();
    });

    it("shows loading state when loading", () => {
        vi.mocked(hooks.useUserSubscriptions).mockReturnValue({
            subscriptions: [],
            isLoading: true,
            error: null,
            unsubscribe: vi.fn(),
            refetch: vi.fn(),
            clearError: vi.fn(),
        });

        render(<NotificationPreferencesSection />);
        const spinner = document.querySelector(".animate-spin");
        expect(spinner).toBeInTheDocument();
    });
});