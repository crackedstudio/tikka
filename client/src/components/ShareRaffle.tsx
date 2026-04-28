import { useCallback, useMemo, useState } from "react";
import Union from "../assets/Union.png";
import { Link2, Share2, Twitter } from "lucide-react";
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

const ShareRaffle = ({ raffleId, title }: ShareRaffleProps) => {
    const [copied, setCopied] = useState(false);

    const shareBlurb = useMemo(
        () => `Check out this raffle: ${title}`,
        [title],
    );

    const twitterHref = useMemo(() => {
        const url = buildRaffleShareUrl(raffleId, "twitter");
        const params = new URLSearchParams({
            text: shareBlurb,
            url: url,
        });
        return `https://twitter.com/intent/tweet?${params.toString()}`;
    }, [raffleId, shareBlurb]);

    const telegramHref = useMemo(() => {
        const url = buildRaffleShareUrl(raffleId, "telegram");
        const params = new URLSearchParams({
            url,
            text: shareBlurb,
        });
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

    const handleNativeShare = useCallback(async () => {
        if (!canWebShare) return;
        try {
            await navigator.share({
                title,
                text: shareBlurb,
                url: nativeShareUrl,
            });
        } catch (err) {
            const name = err instanceof DOMException ? err.name : "";
            if (name === "AbortError") return;
            toast.error("Sharing was cancelled or failed.");
        }
    }, [canWebShare, nativeShareUrl, shareBlurb, title]);

    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(copyHref);
            setCopied(true);
            toast.success("Link copied to clipboard");
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy link");
        }
    }, [copyHref]);

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
                    {canWebShare ? (
                        <button
                            type="button"
                            className={`${iconButtonClass} gap-2 px-4 py-2 rounded-full text-sm font-medium`}
                            onClick={handleNativeShare}
                            aria-label="Share using your device"
                        >
                            <Share2 className="h-5 w-5 shrink-0" />
                            <span className="text-gray-100">Share</span>
                        </button>
                    ) : null}

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
                    <button
                        type="button"
                        className={iconButtonClass}
                        onClick={handleCopyLink}
                        aria-label="Copy raffle link"
                    >
                        <Link2 className="h-5 w-5" />
                        {copied ? (
                            <span className="sr-only">Copied</span>
                        ) : null}
                    </button>
                </div>
            </div>

            <div className="md:flex-shrink-0 hidden w-full md:w-auto ">
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
