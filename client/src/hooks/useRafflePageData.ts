import { useRaffle } from "./useRaffles";
import { useBuyTicketsMutation } from "./useRaffleMutations";
import type { FormattedRaffle } from "../types/types";

/**
 * Discriminated union describing the lifecycle of the RafflePage data.
 *
 * The component can switch on `status` and narrow to the exact field set
 * available in each state instead of null-checking every field.
 */
export type RafflePageData =
    | { status: "loading" }
    | { status: "error"; error: Error }
    | { status: "ready"; raffle: FormattedRaffle };

export interface UseRafflePageDataReturn {
    data: RafflePageData;
    /** Re-fetches the raffle detail (e.g. window focus or post-purchase). */
    refetch: ReturnType<typeof useRaffle>["refetch"];
    /** Ticket purchase mutation that invalidates the relevant query keys on success. */
    purchaseTickets: ReturnType<typeof useBuyTicketsMutation>;
}

/**
 * Central hook for the RafflePage.
 *
 * Assembles all of the page data — raffle detail, plus the ticket purchase
 * mutation — in one place and orchestrates query-key invalidation through
 * `client/src/utils/queryKeys.ts` (via `useRaffle` and `useBuyTicketsMutation`),
 * so a successful ticket purchase consistently refreshes the raffle detail,
 * the raffle list, and the user profile.
 */
export const useRafflePageData = (raffleId: number): UseRafflePageDataReturn => {
    const { raffle, error, isLoading, refetch } = useRaffle(raffleId);
    const purchaseTickets = useBuyTicketsMutation();

    let data: RafflePageData;
    if (isLoading) {
        data = { status: "loading" };
    } else if (error) {
        data = { status: "error", error };
    } else if (raffle) {
        data = { status: "ready", raffle };
    } else {
        data = { status: "error", error: new Error("Raffle not found") };
    }

    return {
        data,
        refetch,
        purchaseTickets,
    };
};