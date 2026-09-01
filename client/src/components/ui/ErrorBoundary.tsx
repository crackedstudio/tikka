import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { logger } from "../../utils/logger";

export interface ErrorFallbackProps {
    error: Error;
    resetErrorBoundary: () => void;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    fallbackRender?: (props: ErrorFallbackProps) => React.ReactNode;
    title?: string;
    message?: string;
    fullScreen?: boolean;
    onReset?: () => void;
    resetKeys?: ReadonlyArray<unknown>;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

function areResetKeysEqual(
    a: ReadonlyArray<unknown> = [],
    b: ReadonlyArray<unknown> = [],
): boolean {
    if (a.length !== b.length) return false;
    return a.every((key, index) => Object.is(key, b[index]));
}

class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logger.error("ErrorBoundary caught an error", {
            error,
            componentStack: errorInfo.componentStack,
        });

        try {
            import("@sentry/react").then((Sentry) => {
                Sentry.captureException(error, {
                    extra: errorInfo as unknown as Record<string, unknown>,
                });
            });
        } catch {
            // Ignore if Sentry is not available on the client
        }
    }

    componentDidUpdate(prevProps: ErrorBoundaryProps) {
        if (
            this.state.hasError &&
            !areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)
        ) {
            this.resetErrorBoundary();
        }
    }

    resetErrorBoundary = () => {
        this.props.onReset?.();
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError && this.state.error) {
            if (this.props.fallbackRender) {
                return this.props.fallbackRender({
                    error: this.state.error,
                    resetErrorBoundary: this.resetErrorBoundary,
                });
            }

            if (this.props.fallback) {
                return this.props.fallback;
            }

            const { title, message, fullScreen } = this.props;

            return (
                <div
                    className={`${
                        fullScreen ? "min-h-screen" : "min-h-[400px]"
                    } flex items-center justify-center px-6`}
                >
                    <div className="text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={32} className="text-red-400" />
                        </div>
                        <h2 className="text-gray-900 dark:text-white text-2xl font-bold mb-2">
                            {title ?? "Something went wrong"}
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-6 max-w-md mx-auto">
                            {message ??
                                "An unexpected error occurred. Please try again or return to the home page."}
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={this.resetErrorBoundary}
                                className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 px-6 py-3 rounded-xl font-medium transition-colors duration-200 inline-flex items-center gap-2"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>
                            <a
                                href="/"
                                className="border border-gray-200 dark:border-[#1F263F] hover:border-pink-500 text-gray-900 dark:text-white px-6 py-3 rounded-xl font-medium transition-colors duration-200"
                            >
                                Go Home
                            </a>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
