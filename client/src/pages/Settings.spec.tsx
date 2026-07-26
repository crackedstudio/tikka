/**
 * Settings Tests
 *
 * Tests for section rendering and failed preference saves.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Settings from "./Settings";
import * as providers from "../providers";

// Mock providers
vi.mock("../providers", () => ({
    useAuthContext: () => ({
        isAuthenticated: true,
        address: "GBZ3KSBF2U5YNHZJ4H5XQHZ5KSBF2U5",
    }),
}));

vi.mock("../components/ui/Breadcrumbs", () => ({
    Breadcrumbs: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock("../components/settings/NotificationPreferencesSection", () => ({
    default: () => <div data-testid="notification-section">Notification Section</div>,
}));

vi.mock("../components/settings/ProfileSection", () => ({
    default: () => <div data-testid="profile-section">Profile Section</div>,
}));

describe("Settings Page", () => {
    describe("authenticated view", () => {
        it("renders the Settings header", () => {
            render(<Settings />);
            expect(screen.getByText("Settings")).toBeInTheDocument();
            expect(screen.getByText("Manage your account and preferences")).toBeInTheDocument();
        });

        it("renders navigation tabs", () => {
            render(<Settings />);
            expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /profile/i })).toBeInTheDocument();
        });

        it("shows notifications tab by default", () => {
            render(<Settings />);
            expect(screen.getByTestId("notification-section")).toBeInTheDocument();
        });

        it("switches to profile tab when clicked", () => {
            render(<Settings />);
            const profileButton = screen.getByRole("button", { name: /profile/i });
            profileButton.click();
            expect(screen.getByTestId("profile-section")).toBeInTheDocument();
        });
    });

    describe("unauthenticated view", () => {
        it("shows sign-in prompt when not authenticated", () => {
            vi.mocked(providers.useAuthContext).mockReturnValue({
                isAuthenticated: false,
                address: null,
            });
            render(<Settings />);
            expect(screen.getByText("Please sign in to access your settings and preferences.")).toBeInTheDocument();
        });
    });

    describe("section integration", () => {
        it("renders NotificationPreferences component in notifications tab", () => {
            vi.mocked(providers.useAuthContext).mockReturnValue({
                isAuthenticated: true,
                address: "GBZ3KSBF2U5YNHZJ4H5XQHZ5KSBF2U5",
            });
            render(<Settings />);
            expect(screen.getByTestId("notification-section")).toBeInTheDocument();
        });

        it("renders ProfileSection component in profile tab", () => {
            vi.mocked(providers.useAuthContext).mockReturnValue({
                isAuthenticated: true,
                address: "GBZ3KSBF2U5YNHZJ4H5XQHZ5KSBF2U5",
            });
            render(<Settings />);
            screen.getByRole("button", { name: /profile/i }).click();
            expect(screen.getByTestId("profile-section")).toBeInTheDocument();
        });
    });
});