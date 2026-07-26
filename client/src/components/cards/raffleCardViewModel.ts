import type { ApiRaffleListItem, ApiRaffleDetail, FormattedRaffle } from "../../types/types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const FALLBACK_IMAGE =
    "https://placehold.co/600x400/11172E/FFF?text=Tikka+Raffle";

/** Raffles with ≤ 24 h remaining are flagged as ending-soon. */
const ENDING_SOON_THRESHOLD_S = 24 * 60 * 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export type RaffleStatus = "live" | "ending-soon" | "finalized" | "cancelled";

export interface RaffleCardViewModel {
    raffleId: number;
    title: string;
    /** Long-form blurb shown in the featured card's body area. */
    description: string;
    /** Always non-empty: falls back to FALLBACK_IMAGE when the API returns null. */
    imageUrl: string;
    status: RaffleStatus;
    /** Human-readable label: "Live" | "Ending Soon" | "Finalized" | "Cancelled" */
    statusLabel: string;
    /** Pre-formatted price+asset string, e.g. "10.000 XLM". */
    ticketPrice: string;
    /** Raw asset symbol, e.g. "XLM". */
    ticketAsset: string;
    prizeValue: string;
    prizeCurrency: string;
    entries: number;
    maxTickets: number;
    /** 0–100, clamped. */
    progress: number;
    /** Unix timestamp (seconds) of raffle close time. */
    endTimeUnix: number;
    countdown: {
        days: string;
        hours: string;
        minutes: string;
        seconds: string;
    };
    winner: string | null;
    buttonText: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<RaffleStatus, string> = {
    live: "Live",
    "ending-soon": "Ending Soon",
    finalized: "Finalized",
    cancelled: "Cancelled",
};

function deriveStatus(apiStatus: string, endTimeUnix: number): RaffleStatus {
    const s = apiStatus.toLowerCase();
    if (s === "finalized") return "finalized";
    if (s === "cancelled") return "cancelled";
    const remaining = endTimeUnix - Math.floor(Date.now() / 1000);
    return remaining <= ENDING_SOON_THRESHOLD_S ? "ending-soon" : "live";
}

function deriveButtonText(status: RaffleStatus): string {
    if (status === "live" || status === "ending-soon") return "Enter Raffle";
    if (status === "finalized") return "View Winner";
    return "Cancelled";
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a countdown object from a Unix timestamp (seconds).
 * All values are zero-padded to 2 digits and floor-clamped to 0.
 */
export function buildCountdown(endTimeUnix: number): RaffleCardViewModel["countdown"] {
    const remaining = Math.max(0, endTimeUnix - Math.floor(Date.now() / 1000));
    return {
        days: Math.floor(remaining / 86400).toString().padStart(2, "0"),
        hours: Math.floor((remaining % 86400) / 3600).toString().padStart(2, "0"),
        minutes: Math.floor((remaining % 3600) / 60).toString().padStart(2, "0"),
        seconds: (remaining % 60).toString().padStart(2, "0"),
    };
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * Primary mapper: converts an API list item (or detail) into a RaffleCardViewModel.
 *
 * `ApiRaffleDetail extends ApiRaffleListItem`, so detail-only fields (title,
 * description, image_url) are accessed via type widening and guarded with `??`.
 */
export function toRaffleCardViewModel(item: ApiRaffleListItem): RaffleCardViewModel {
    const detail = item as ApiRaffleDetail;
    const endTimeUnix = Math.floor(new Date(item.end_time).getTime() / 1000);
    const status = deriveStatus(item.status, endTimeUnix);
    const asset = item.asset || "XLM";
    const ticketPriceNum = parseFloat(item.ticket_price);
    const title = detail.title ?? `Raffle #${item.id}`;

    return {
        raffleId: item.id,
        title,
        description: detail.description ?? title,
        imageUrl: detail.image_url ?? FALLBACK_IMAGE,
        status,
        statusLabel: STATUS_LABELS[status],
        ticketPrice: `${ticketPriceNum.toFixed(3)} ${asset}`,
        ticketAsset: asset,
        prizeValue: item.prize_amount ?? "0",
        prizeCurrency: asset,
        entries: item.tickets_sold,
        maxTickets: item.max_tickets,
        progress:
            item.max_tickets > 0
                ? Math.min((item.tickets_sold / item.max_tickets) * 100, 100)
                : 0,
        endTimeUnix,
        countdown: buildCountdown(endTimeUnix),
        winner: item.winner,
        buttonText: deriveButtonText(status),
    };
}

/**
 * Adapter for callers that already hold a FormattedRaffle (returned by useRaffle).
 * Avoids requiring those callers to re-fetch raw API data.
 */
export function formattedRaffleToViewModel(raffle: FormattedRaffle): RaffleCardViewModel {
    const status = deriveStatus(raffle.status, raffle.endTime);
    const imageUrl =
        raffle.image || raffle.metadata?.image || FALLBACK_IMAGE;

    return {
        raffleId: raffle.id,
        title: raffle.metadata?.title ?? raffle.description,
        description: raffle.metadata?.description ?? raffle.description,
        imageUrl,
        status,
        statusLabel: STATUS_LABELS[status],
        ticketPrice: raffle.ticketPriceFormatted,
        ticketAsset: raffle.ticketToken ?? "XLM",
        prizeValue: raffle.prizeValue,
        prizeCurrency: raffle.prizeCurrency,
        entries: raffle.entries,
        maxTickets: raffle.maxTickets,
        progress: raffle.progress,
        endTimeUnix: raffle.endTime,
        countdown: raffle.countdown,
        winner: raffle.winner,
        buttonText: raffle.buttonText,
    };
}
