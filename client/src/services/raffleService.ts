import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";
import type {
    ApiRaffleListItem,
    ApiRaffleListResponse,
    ApiRaffleDetail,
    ApiUserProfile,
    ApiUserHistoryResponse,
    RaffleListFilters,
    FormattedRaffle,
} from "../types/types";

// --- Helper Functions ---

function buildQueryString(filters: RaffleListFilters): string {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.category) params.set("category", filters.category);
    if (filters.creator) params.set("creator", filters.creator);
    if (filters.asset) params.set("asset", filters.asset);
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.offset != null) params.set("offset", String(filters.offset));
    const query = params.toString();
    return query ? `?${query}` : "";
}

// --- Exported Functions ---

export async function fetchRaffles(
    filters: RaffleListFilters = {}
): Promise<ApiRaffleListResponse> {
    const queryString = buildQueryString(filters);
    const endpoint = API_CONFIG.endpoints.raffles.list + queryString;
    return api.get<ApiRaffleListResponse>(endpoint);
}

export async function fetchRaffleDetail(
    id: number
): Promise<ApiRaffleDetail> {
    const endpoint = API_CONFIG.endpoints.raffles.detail(String(id));
    return api.get<ApiRaffleDetail>(endpoint);
}


export async function searchRaffles(
    query: string
): Promise<ApiRaffleListResponse> {
    const trimmedQuery = query.trim();
    const endpoint = `${API_CONFIG.endpoints.search}?q=${encodeURIComponent(trimmedQuery)}`;
    return api.get<ApiRaffleListResponse>(endpoint);
}
export async function fetchUserProfile(address: string): Promise<ApiUserProfile> {
    const endpoint = API_CONFIG.endpoints.users.profile(encodeURIComponent(address));
    return api.get<ApiUserProfile>(endpoint);
}

export async function fetchUserHistory(
    address: string,
    limit = 20,
    offset = 0,
): Promise<ApiUserHistoryResponse> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const endpoint = `${API_CONFIG.endpoints.users.history(encodeURIComponent(address))}?${params.toString()}`;
    return api.get<ApiUserHistoryResponse>(endpoint);
}

export function mapListItemToCardProps(item: ApiRaffleListItem) {
    const endTimeUnix = Math.floor(new Date(item.end_time).getTime() / 1000);
    const timeRemaining = endTimeUnix - Math.floor(Date.now() / 1000);

    const days = Math.max(0, Math.floor(timeRemaining / (24 * 60 * 60)));
    const hours = Math.max(0, Math.floor((timeRemaining % (24 * 60 * 60)) / (60 * 60)));
    const minutes = Math.max(0, Math.floor((timeRemaining % (60 * 60)) / 60));
    const seconds = Math.max(0, timeRemaining % 60);

    return {
        raffleId: item.id,
        image: "https://placehold.co/600x400/11172E/FFF?text=Tikka+Raffle",
        title: `Raffle #${item.id}`, // ApiRaffleListItem usually lacks 'title' in raw form
        prizeValue: item.prize_amount || "0",
        prizeCurrency: item.asset || "XLM",
        ticketPrice: `${parseFloat(item.ticket_price).toFixed(3)} ${item.asset || "XLM"}`,
        entries: item.tickets_sold,
        progress: item.max_tickets > 0 ? (item.tickets_sold / item.max_tickets) * 100 : 0,
        countdown: {
            days: days.toString().padStart(2, "0"),
            hours: hours.toString().padStart(2, "0"),
            minutes: minutes.toString().padStart(2, "0"),
            seconds: seconds.toString().padStart(2, "0"),
        }
    };
}

export function mapDetailToFormattedRaffle(
    detail: ApiRaffleDetail
): FormattedRaffle {
    const endTimeUnix = Math.floor(
        new Date(detail.end_time).getTime() / 1000
    );
    const timeRemaining = endTimeUnix - Math.floor(Date.now() / 1000);

    const days = Math.max(0, Math.floor(timeRemaining / (24 * 60 * 60)));
    const hours = Math.max(0, Math.floor((timeRemaining % (24 * 60 * 60)) / (60 * 60)));
    const minutes = Math.max(0, Math.floor((timeRemaining % (60 * 60)) / 60));
    const seconds = Math.max(0, timeRemaining % 60);

    const progress = detail.max_tickets > 0 ? (detail.tickets_sold / detail.max_tickets) * 100 : 0;
    const ticketPrice = parseFloat(detail.ticket_price);
    const isActive = detail.status === "open" || detail.status === "OPEN";

    return {
        id: detail.id,
        creator: detail.creator,
        status: detail.status,
        description: detail.title || `Raffle #${detail.id}`,
        endTime: endTimeUnix,
        maxTickets: detail.max_tickets,
        allowMultipleTickets: true,
        ticketPrice: detail.ticket_price,
        ticketToken: detail.asset || undefined,
        totalTicketsSold: detail.tickets_sold,
        winner: detail.winner,
        winningTicketId: 0,
        isActive,
        isFinalized: !isActive,
        winningsWithdrawn: false,
        countdown: {
            days: days.toString().padStart(2, "0"),
            hours: hours.toString().padStart(2, "0"),
            minutes: minutes.toString().padStart(2, "0"),
            seconds: seconds.toString().padStart(2, "0"),
        },
        progress: Math.min(progress, 100),
        entries: detail.tickets_sold,
        ticketPriceFormatted: `${ticketPrice.toFixed(3)} ${detail.asset || "XLM"}`,
        prizeValue: detail.prize_amount || "0",
        prizeCurrency: detail.asset || "XLM",
        buttonText: isActive ? "Enter Raffle" : "Ended",
        image: detail.image_url || "",
        metadata: {
            title: detail.title || `Raffle #${detail.id}`,
            description: detail.description || "",
            image: detail.image_url || "",
            prizeName: detail.title || `Raffle #${detail.id}`,
            prizeValue: detail.prize_amount || "0",
            prizeCurrency: detail.asset || "XLM",
            category: detail.category || "General",
            tags: detail.category ? [detail.category] : [],
            createdBy: detail.creator,
            createdAt: new Date(detail.created_at).getTime(),
            updatedAt: new Date(detail.created_at).getTime(),
        },
    };
}