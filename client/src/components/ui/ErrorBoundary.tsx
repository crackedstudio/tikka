import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
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
        console.error("ErrorBoundary caught:", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center px-6">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={32} className="text-red-400" />
                        </div>
                        <h2 className="text-white text-2xl font-bold mb-2">
                            Something went wrong
                        </h2>
                        <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                            An unexpected error occurred. Please try again or
                            return to the home page.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={this.handleReset}
                                className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-xl font-medium transition-colors duration-200 inline-flex items-center gap-2"
                            >
                                <RefreshCw size={16} />
                                Try Again
                            </button>
                            <a
                                href="/"
                                className="border border-[#1F263F] hover:border-[#FF389C]/50 text-white px-6 py-3 rounded-xl font-medium transition-colors duration-200"
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
