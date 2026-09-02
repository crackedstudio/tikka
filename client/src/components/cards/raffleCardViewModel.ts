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
    description: string;
    imageUrl: string;
    status: RaffleStatus;
    statusLabel: string;
    isActive: boolean;
    ticketPrice: string;
    ticketAsset: string;
    prizeValue: string;
    prizeCurrency: string;
    entries: number;
    maxTickets: number;
    progress: number;
    endTimeUnix: number;
    countdown: { days: string; hours: string; minutes: string; seconds: string };
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

function deriveStatus(apiStatus: string, endTimeUnix: number, nowUnix?: number): RaffleStatus {
    const s = apiStatus.toLowerCase();
    if (s === "finalized") return "finalized";
    if (s === "cancelled") return "cancelled";
    const now = nowUnix ?? Math.floor(Date.now() / 1000);
    const remaining = endTimeUnix - now;
    return remaining <= ENDING_SOON_THRESHOLD_S ? "ending-soon" : "live";
}

function deriveButtonText(status: RaffleStatus): string {
    if (status === "live" || status === "ending-soon") return "Enter Raffle";
    if (status === "finalized") return "View Winner";
    return "Cancelled";
}

function isActiveStatus(status: RaffleStatus): boolean {
    return status === "live" || status === "ending-soon";
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a countdown object from a Unix timestamp (seconds).
 * All values are zero-padded to 2 digits and floor-clamped to 0.
 * Optionally pass `nowUnix` to make the function deterministic for tests.
 */
export function buildCountdown(
    endTimeUnix: number,
    nowUnix?: number,
): RaffleCardViewModel["countdown"] {
    const now = nowUnix ?? Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, endTimeUnix - now);
    return {
        days: Math.floor(remaining / 86400).toString().padStart(2, "0"),
        hours: Math.floor((remaining % 86400) / 3600).toString().padStart(2, "0"),
        minutes: Math.floor((remaining % 3600) / 60).toString().padStart(2, "0"),
        seconds: (remaining % 60).toString().padStart(2, "0"),
    };
}

/**
 * Format a numeric price as a fixed-precision string with the asset symbol.
 */
export function formatTicketPrice(price: string | number, asset: string): string {
    const num = typeof price === "string" ? parseFloat(price) : price;
    if (Number.isNaN(num)) return `0.000 ${asset}`;
    return `${num.toFixed(3)} ${asset}`;
}

/**
 * Calculate raffle progress as a percentage between 0 and 100.
 * Returns 0 when maxTickets is 0 to avoid division by zero.
 */
export function calculateProgress(ticketsSold: number, maxTickets: number): number {
    if (maxTickets <= 0) return 0;
    return Math.min((ticketsSold / maxTickets) * 100, 100);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * Primary mapper: converts an API list item (or detail) into a RaffleCardViewModel.
 * Optionally pass `nowUnix` for deterministic status/countdown calculation in tests.
 */
export function toRaffleCardViewModel(
    item: ApiRaffleListItem,
    nowUnix?: number,
): RaffleCardViewModel {
    const detail = item as ApiRaffleDetail;
    const endTimeUnix = Math.floor(new Date(item.end_time).getTime() / 1000);
    const status = deriveStatus(item.status, endTimeUnix, nowUnix);
    const asset = item.asset || "XLM";
    const title = detail.title ?? `Raffle #${item.id}`;

    return {
        raffleId: item.id,
        title,
        description: detail.description ?? title,
        imageUrl: detail.image_url ?? FALLBACK_IMAGE,
        status,
        statusLabel: STATUS_LABELS[status],
        isActive: isActiveStatus(status),
        ticketPrice: formatTicketPrice(item.ticket_price, asset),
        ticketAsset: asset,
        prizeValue: item.prize_amount ?? "0",
        prizeCurrency: asset,
        entries: item.tickets_sold,
        maxTickets: item.max_tickets,
        progress: calculateProgress(item.tickets_sold, item.max_tickets),
        endTimeUnix,
        countdown: buildCountdown(endTimeUnix, nowUnix),
        winner: item.winner,
        buttonText: deriveButtonText(status),
    };
}

/**
 * Adapter for callers that already hold a FormattedRaffle (returned by useRaffle).
 * Avoids requiring those callers to re-fetch raw API data.
 */
export function formattedRaffleToViewModel(
    raffle: FormattedRaffle,
    nowUnix?: number,
): RaffleCardViewModel {
    const status = deriveStatus(raffle.status, raffle.endTime, nowUnix);
    const imageUrl = raffle.image || raffle.metadata?.image || FALLBACK_IMAGE;

    return {
        raffleId: raffle.id,
        title: raffle.metadata?.title ?? raffle.description,
        description: raffle.metadata?.description ?? raffle.description,
        imageUrl,
        status,
        statusLabel: STATUS_LABELS[status],
        isActive: isActiveStatus(status),
        ticketPrice: raffle.ticketPriceFormatted,
        ticketAsset: raffle.ticketToken ?? "XLM",
        prizeValue: raffle.prizeValue,
        prizeCurrency: raffle.prizeCurrency,
        entries: raffle.entries,
        maxTickets: raffle.maxTickets,
        progress: raffle.progress,
        endTimeUnix: raffle.endTime,
        countdown: buildCountdown(raffle.endTime, nowUnix),
        winner: raffle.winner,
        buttonText: raffle.buttonText,
    };
}
