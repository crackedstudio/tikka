import { type ButtonHTMLAttributes, useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";

type CopyButtonProps = {
    value: string;
    defaultLabel?: string;
    copiedLabel?: string;
    ariaLabel?: string;
    successMessage?: string;
    errorMessage?: string;
    timeoutMs?: number;
    className?: string;
    labelClassName?: string;
    iconClassName?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "aria-label">;

function copyViaExecCommand(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    try {
        return document.execCommand("copy");
    } finally {
        document.body.removeChild(ta);
    }
}

async function copyText(text: string): Promise<boolean> {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fall back below.
        }
    }

    return copyViaExecCommand(text);
}

const CopyButton = ({
    value,
    defaultLabel = "Copy",
    copiedLabel = "Copied!",
    ariaLabel,
    successMessage = "Copied to clipboard",
    errorMessage = "Could not copy to clipboard",
    timeoutMs = 2000,
    className = "",
    labelClassName = "",
    iconClassName = "",
    disabled,
    type = "button",
    ...buttonProps
}: CopyButtonProps) => {
    const [copied, setCopied] = useState(false);
    const [announcement, setAnnouncement] = useState("");
    const timeoutRef = useRef<number | null>(null);
    const liveRegionId = useId();

    useEffect(() => {
        return () => {
            if (timeoutRef.current !== null) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const handleClick = useCallback(async () => {
        if (!value || disabled) {
            return;
        }

        const success = await copyText(value);

        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
        }

        if (success) {
            setCopied(true);
            setAnnouncement(successMessage);
            timeoutRef.current = window.setTimeout(() => {
                setCopied(false);
                setAnnouncement("");
            }, timeoutMs);
            return;
        }

        setCopied(false);
        setAnnouncement(errorMessage);
    }, [disabled, errorMessage, successMessage, timeoutMs, value]);

    return (
        <>
            <button
                {...buttonProps}
                type={type}
                disabled={disabled || !value}
                onClick={handleClick}
                aria-label={copied ? copiedLabel : (ariaLabel || defaultLabel)}
                aria-describedby={liveRegionId}
                className={className}
            >
                {copied ? (
                    <Check className={iconClassName} aria-hidden="true" />
                ) : (
                    <Link2 className={iconClassName} aria-hidden="true" />
                )}
                <span className={labelClassName}>{copied ? copiedLabel : defaultLabel}</span>
            </button>
            <span id={liveRegionId} aria-live="polite" className="sr-only">
                {announcement}
            </span>
        </>
    );
};

export default CopyButton;
