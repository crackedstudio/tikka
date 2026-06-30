import { useCallback, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Union from "../assets/Union.png";
import { Download, Link2, Share2, Twitter } from "lucide-react";
import { toast } from "sonner";

type ShareSource = "twitter" | "telegram" | "native" | "copy";

type ShareRaffleProps = {
    raffleId: number;
    title: string;
};

function buildRaffleShareUrl(raffleId: number, utmSource?: ShareSource): string {
    if (typeof window === "undefined") {
        return "";
    }
    const url = new URL(`${window.location.origin}/raffles/${raffleId}`);
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", "raffle_share");
    if (utmSource) {
        url.searchParams.set("utm_source", utmSource);
    }
    return url.toString();
}

function TelegramIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
        >
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
    );
}

const iconButtonClass =
    "inline-flex items-center justify-center rounded-full bg-[#090E1F] p-2.5 text-[#00E6CC] ring-1 ring-[#00E6CC]/20 transition hover:bg-[#00E6CC]/10 hover:ring-[#00E6CC]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E6CC]";

/** Fallback copy for environments without Clipboard API (non-HTTPS, legacy browsers). */
function copyViaExecCommand(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
        return document.execCommand("copy");
    } finally {
        document.body.removeChild(ta);
    }
}

const ShareRaffle = ({ raffleId, title }: ShareRaffleProps) => {
    const [copied, setCopied] = useState(false);
    const qrRef = useRef<SVGSVGElement | null>(null);

    const shareBlurb = useMemo(
        () => `Check out this raffle: ${title}`,
        [title],
    );

    const twitterHref = useMemo(() => {
        const url = buildRaffleShareUrl(raffleId, "twitter");
        const params = new URLSearchParams({ text: shareBlurb, url });
        return `https://twitter.com/intent/tweet?${params.toString()}`;
    }, [raffleId, shareBlurb]);

    const telegramHref = useMemo(() => {
        const url = buildRaffleShareUrl(raffleId, "telegram");
        const params = new URLSearchParams({ url, text: shareBlurb });
        return `https://t.me/share/url?${params.toString()}`;
    }, [raffleId, shareBlurb]);

    const copyHref = useMemo(
        () => buildRaffleShareUrl(raffleId, "copy"),
        [raffleId],
    );

    const nativeShareUrl = useMemo(
        () => buildRaffleShareUrl(raffleId, "native"),
        [raffleId],
    );

    const canWebShare =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function";

    const handleCopyLink = useCallback(async () => {
        let success = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(copyHref);
                success = true;
            } catch {
                // fall through to execCommand
            }
        }
        if (!success) {
            success = copyViaExecCommand(copyHref);
        }
        if (success) {
            setCopied(true);
            toast.success("Link copied!");
            window.setTimeout(() => setCopied(false), 2000);
        } else {
            toast.error("Could not copy link");
        }
    }, [copyHref]);

    const handleNativeShare = useCallback(async () => {
        if (canWebShare) {
            try {
                await navigator.share({ title, text: shareBlurb, url: nativeShareUrl });
                return;
            } catch (err) {
                const name = err instanceof DOMException ? err.name : "";
                if (name === "AbortError") return;
                toast.error("Sharing was cancelled or failed.");
                return;
            }
        }
        // Fall back to clipboard when Web Share API is not available
        await handleCopyLink();
    }, [canWebShare, nativeShareUrl, shareBlurb, title, handleCopyLink]);

    const handleDownloadQr = useCallback(() => {
        const svg = qrRef.current;
        if (!svg) return;

        const serialized = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            const canvas = document.createElement("canvas");
            // Render at 2× for sharper prints
            canvas.width = img.naturalWidth * 2;
            canvas.height = img.naturalHeight * 2;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            canvas.toBlob((blob) => {
                if (!blob) return;
                const pngUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = pngUrl;
                a.download = `raffle-${raffleId}-qr.png`;
                a.click();
                URL.revokeObjectURL(pngUrl);
            }, "image/png");
        };
        img.src = url;
    }, [raffleId]);

    return (
        <div className="bg-white dark:bg-[#11172E] rounded-3xl flex flex-col md:flex-row justify-between items-center border border-gray-200 dark:border-[#1F263F] mt-8 overflow-hidden">
            <div className="p-8 flex-1 w-full">
                <h3 className="text-[22px] font-semibold text-gray-900 dark:text-white">
                    Share This Raffle
                </h3>
                <p className="mt-3 text-gray-600 dark:text-[#9CA3AF] text-sm md:text-base">
                    Invite your friends to join and increase the excitement!
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        className={`${iconButtonClass} gap-2 px-4 py-2 rounded-full text-sm font-medium`}
                        onClick={handleNativeShare}
                        aria-label="Share"
                    >
                        <Share2 className="h-5 w-5 shrink-0" />
                        <span className="text-gray-100">Share</span>
                    </button>

                    <a
                        href={twitterHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={iconButtonClass}
                        aria-label="Share on X (Twitter)"
                    >
                        <Twitter className="h-5 w-5" />
                    </a>
                    <a
                        href={telegramHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={iconButtonClass}
                        aria-label="Share on Telegram"
                    >
                        <TelegramIcon className="h-5 w-5" />
                    </a>

                    {/* Copy Link button */}
                    <button
                        type="button"
                        className={`${iconButtonClass} gap-2 px-4 py-2 rounded-full text-sm font-medium`}
                        onClick={handleCopyLink}
                        aria-label={copied ? "Copied!" : "Copy raffle link"}
                    >
                        <Link2 className="h-5 w-5 shrink-0" />
                        <span className="text-gray-100">{copied ? "Copied!" : "Copy Link"}</span>
                    </button>
                </div>

                {/* QR code section */}
                <div className="mt-6 flex flex-col items-start gap-3">
                    <p className="text-xs text-gray-500 dark:text-[#6B7280] uppercase tracking-wide font-medium">
                        QR Code
                    </p>
                    <div className="p-3 bg-white rounded-xl ring-1 ring-gray-200 dark:ring-[#1F263F] inline-block">
                        <QRCodeSVG
                            ref={qrRef}
                            value={copyHref}
                            size={128}
                            level="M"
                            aria-label={`QR code for raffle: ${title}`}
                        />
                    </div>
                    <button
                        type="button"
                        className={`${iconButtonClass} gap-2 px-4 py-2 rounded-full text-sm font-medium`}
                        onClick={handleDownloadQr}
                        aria-label="Download QR code as PNG"
                    >
                        <Download className="h-5 w-5 shrink-0" />
                        <span className="text-gray-100">Download QR</span>
                    </button>
                </div>
            </div>

            <div className="md:flex-shrink-0 hidden w-full md:w-auto">
                <img
                    src={Union}
                    alt=""
                    className="w-full md:w-auto object-contain"
                />
            </div>
        </div>
    );
};

export default ShareRaffle;
