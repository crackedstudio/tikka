import { describe, test, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const { mockUpdateServiceWorker, mockUseRegisterSW } = vi.hoisted(() => {
    const mockUpdateServiceWorker = vi.fn();
    const mockUseRegisterSW = vi.fn().mockImplementation((options: { onNeedRefresh?: () => void }) => {
        if (options?.onNeedRefresh) {
            (mockUseRegisterSW as unknown as Record<string, unknown>)._onNeedRefresh = options.onNeedRefresh;
        }
        return {
            needRefresh: [false, vi.fn()],
            offlineReady: [false, vi.fn()],
            updateServiceWorker: mockUpdateServiceWorker,
        };
    });
    return { mockUpdateServiceWorker, mockUseRegisterSW };
});

vi.mock("virtual:pwa-register/react", () => ({
    useRegisterSW: mockUseRegisterSW,
}));

vi.mock("sonner", () => {
    const toastFn = Object.assign(vi.fn(() => "test-toast-id"), {
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    });
    return { toast: toastFn, Toaster: () => null };
});

import { toast } from "sonner";
import { ServiceWorkerUpdate } from "./ServiceWorkerUpdate";

const server = setupServer(
    http.get("/sw.js", () => {
        return new HttpResponse(null, { status: 200 });
    }),
);

describe("ServiceWorkerUpdate", () => {
    beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
    afterEach(() => {
        server.resetHandlers();
        vi.clearAllMocks();
    });
    afterAll(() => server.close());

    test("renders nothing on mount", () => {
        const { container } = render(<ServiceWorkerUpdate />);
        expect(container.innerHTML).toBe("");
    });

    test("shows new version toast with Refresh button when update detected", async () => {
        render(<ServiceWorkerUpdate />);

        const triggerRefresh = (mockUseRegisterSW as unknown as Record<string, unknown>)._onNeedRefresh as (() => void);
        expect(triggerRefresh).toBeDefined();
        triggerRefresh();

        await waitFor(() => {
            expect(toast).toHaveBeenCalledWith(
                "New version available",
                expect.objectContaining({
                    action: expect.objectContaining({
                        label: "Refresh",
                    }),
                }),
            );
        });
    });

    test("clicking Refresh calls updateServiceWorker", async () => {
        render(<ServiceWorkerUpdate />);

        const triggerRefresh = (mockUseRegisterSW as unknown as Record<string, unknown>)._onNeedRefresh as (() => void);

        let onClick: (() => void) | undefined;
        vi.mocked(toast).mockImplementation((...args: any[]) => {
            const opts = args[1] as { action?: { onClick: () => void } } | undefined;
            if (opts?.action?.onClick) {
                onClick = opts.action.onClick;
            }
            return "test-toast-id" as any;
        });

        triggerRefresh();

        await waitFor(() => expect(onClick).toBeDefined());

        onClick!();
        expect(mockUpdateServiceWorker).toHaveBeenCalled();
    });
});
