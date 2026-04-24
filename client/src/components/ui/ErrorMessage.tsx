import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorMessageProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    retryLabel?: string;
    variant?: "full" | "inline";
    className?: string;
    disabled?: boolean;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
    title = "Something went wrong",
    message,
    onRetry,
    retryLabel = "Try Again",
    variant = "full",
    className = "",
    disabled = false,
}) => {
    if (variant === "inline") {
        return (
            <div className={`flex flex-col items-center gap-2 py-4 ${className}`}>
                <p className="text-red-400 text-sm text-center">{title}</p>
                {message && (
                    <p className="text-gray-500 text-xs text-center">{message}</p>
                )}
                {onRetry && (
                    <button
                        onClick={onRetry}
                        disabled={disabled}
                        className="text-[#FF389C] hover:text-[#FF389C]/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-1.5 transition-colors"
                    >
                        <RefreshCw size={14} />
                        {retryLabel}
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`text-center py-12 ${className}`}>
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-400" />
            </div>
            <h3 className="text-white text-xl font-semibold mb-2">{title}</h3>
            {message && (
                <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">
                    {message}
                </p>
            )}
            {onRetry && (
                <button
                    onClick={onRetry}
                    disabled={disabled}
                    className="bg-[#FF389C] hover:bg-[#FF389C]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors duration-200 inline-flex items-center gap-2"
                >
                    <RefreshCw size={16} />
                    {retryLabel}
                </button>
            )}
        </div>
    );
};

export default ErrorMessage;
