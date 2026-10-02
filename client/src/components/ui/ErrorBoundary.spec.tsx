import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ErrorBoundary, { ErrorFallbackProps } from "./ErrorBoundary";
import { logger } from "../../utils/logger";
import { initClientSentry } from "../../sentry";

const sentryMock = vi.hoisted(() => {
    const scope = {
        setTag: vi.fn(),
        setContext: vi.fn(),
        setUser: vi.fn(),
        setLevel: vi.fn(),
    };

    return {
        scope,
        captureException: vi.fn(),
        init: vi.fn(),
        withScope: vi.fn((callback: (activeScope: typeof scope) => void) =>
            callback(scope),
        ),
    };
});

vi.mock("@sentry/react", () => ({
    init: sentryMock.init,
    captureException: sentryMock.captureException,
    withScope: sentryMock.withScope,
}));

// The boundary reports through the shared client sink, which is inert until it
// has been initialised with a DSN.
beforeAll(async () => {
    await initClientSentry({ VITE_SENTRY_DSN: "https://example.ingest.sentry.io/1" });
});

const Boom = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
        throw new Error("boom");
    }
    return <div>Recovered content</div>;
};

const renderWithRouter = (
    ui: React.ReactNode,
    initialEntries: string[] = ["/"],
) =>
    render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route path="/" element={ui} />
            </Routes>
        </MemoryRouter>,
    );

describe("ErrorBoundary", () => {
    // The suite stubs console.error to keep expected error-boundary
    // output out of the test report.
    /* eslint-disable no-console */
    const originalError = console.error;

    beforeEach(() => {
        vi.clearAllMocks();
        console.error = vi.fn();
    });

    afterEach(() => {
        console.error = originalError;
    });
    /* eslint-enable no-console */

    it("renders the default fallback with a working Try Again action when a child throws", async () => {
        let throwNow = true;
        const Child = () => <Boom shouldThrow={throwNow} />;

        renderWithRouter(
            <ErrorBoundary>
                <Child />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Something went wrong")).toBeInTheDocument();

        const retry = screen.getByRole("button", { name: /try again/i });
        expect(retry).toBeInTheDocument();

        throwNow = false;
        fireEvent.click(retry);

        await waitFor(() => {
            expect(screen.getByText("Recovered content")).toBeInTheDocument();
        });
    });

    it("renders the route-appropriate fallback when title/message props are provided", () => {
        const Child = () => <Boom shouldThrow />;

        renderWithRouter(
            <ErrorBoundary
                title="We couldn't load this raffle"
                message="The raffle may have been removed."
            >
                <Child />
            </ErrorBoundary>,
        );

        expect(
            screen.getByText("We couldn't load this raffle"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("The raffle may have been removed."),
        ).toBeInTheDocument();
    });

    it("supports a custom fallbackRender that receives a resetErrorBoundary callback", async () => {
        let throwNow = true;
        const fallbackRender = ({ resetErrorBoundary }: ErrorFallbackProps) => (
            <button onClick={resetErrorBoundary}>Retry path</button>
        );

        const Child = () => <Boom shouldThrow={throwNow} />;

        renderWithRouter(
            <ErrorBoundary fallbackRender={fallbackRender}>
                <Child />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Retry path")).toBeInTheDocument();

        throwNow = false;
        fireEvent.click(screen.getByText("Retry path"));

        await waitFor(() => {
            expect(screen.getByText("Recovered content")).toBeInTheDocument();
        });
    });

    it("resets automatically when resetKeys change", async () => {
        const { rerender } = renderWithRouter(
            <ErrorBoundary resetKeys={[1]}>
                <Boom shouldThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByText("Something went wrong")).toBeInTheDocument();

        rerender(
            <MemoryRouter initialEntries={["/"]}>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <ErrorBoundary resetKeys={[2]}>
                                <Boom shouldThrow={false} />
                            </ErrorBoundary>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByText("Recovered content")).toBeInTheDocument();
        });
    });

    it("reports the caught error through the logger", () => {
        const loggerSpy = vi.spyOn(logger, "error");
        loggerSpy.mockImplementation(() => {});

        const Child = () => <Boom shouldThrow />;

        renderWithRouter(
            <ErrorBoundary>
                <Child />
            </ErrorBoundary>,
        );

        expect(loggerSpy).toHaveBeenCalledWith(
            "ErrorBoundary caught an error",
            expect.objectContaining({ error: expect.any(Error) }),
        );

        loggerSpy.mockRestore();
    });

    it("reports the caught error to the client error sink", async () => {
        const Child = () => <Boom shouldThrow />;

        renderWithRouter(
            <ErrorBoundary>
                <Child />
            </ErrorBoundary>,
        );

        await vi.waitFor(() => {
            expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
        });

        expect(sentryMock.scope.setTag).toHaveBeenCalledWith(
            "source",
            "error-boundary",
        );
        expect(sentryMock.scope.setLevel).toHaveBeenCalledWith("error");
    });
});
