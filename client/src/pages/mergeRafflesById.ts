import type { ApiRaffleListItem } from "../types/raffle";

/**
 * Merge paginated raffle lists into a single list keyed by id.
 * First-seen order is preserved; later entries with the same id replace the value.
 */
export function mergeRafflesById(
    ...pages: ReadonlyArray<ReadonlyArray<ApiRaffleListItem>>
): ApiRaffleListItem[] {
    const map = new Map<number, ApiRaffleListItem>();
    for (const page of pages) {
        for (const raffle of page) {
            map.set(raffle.id, raffle);
        }
    }
    return Array.from(map.values());
}
