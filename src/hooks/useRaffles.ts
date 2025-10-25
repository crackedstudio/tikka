import { useActiveRaffleIds, useRaffleData } from "./useRaffleContract";
import { useMemo, useState, useEffect } from "react";
import { MetadataService } from "../services/metadataService";
import type { RaffleMetadata } from "../types/types";

// Hook to get all active raffles with their data
export const useActiveRaffles = () => {
    const {
        data: activeRaffleIds,
        error: idsError,
        isLoading: idsLoading,
    } = useActiveRaffleIds();

    console.log(
        "🔍 useActiveRaffles - Active raffle IDs raw:",
        activeRaffleIds
    );
    console.log("🔍 useActiveRaffles - Error:", idsError);
    console.log("🔍 useActiveRaffles - Loading:", idsLoading);

    // For each active raffle ID, we need to fetch the raffle data
    // This is a simplified approach - in a real app you might want to batch these calls
    const raffles = useMemo(() => {
        console.log(
            "🔍 useActiveRaffles - Processing activeRaffleIds:",
            activeRaffleIds
        );
        console.log(
            "🔍 useActiveRaffles - Is array?",
            Array.isArray(activeRaffleIds)
        );
        console.log("🔍 useActiveRaffles - Length:", activeRaffleIds?.length);

        if (
            !activeRaffleIds ||
            !Array.isArray(activeRaffleIds) ||
            activeRaffleIds.length === 0
        ) {
            console.log(
                "🔍 useActiveRaffles - No raffles found, returning empty array"
            );
            return [];
        }

        // Return the IDs for now - we'll fetch individual raffle data in components
        // NOTE: This creates N+1 query pattern:
        // 1 call to getActiveRaffleIds() + N calls to getRaffleData() for each ID
        const processedRaffles = activeRaffleIds.map((id: bigint) =>
            Number(id)
        );
        console.log(
            "🔍 useActiveRaffles - Processed raffles:",
            processedRaffles
        );
        console.log(
            "🔍 useActiveRaffles - This will trigger",
            processedRaffles.length,
            "individual getRaffleData() calls"
        );
        return processedRaffles;
    }, [activeRaffleIds]);

    console.log("🔍 useActiveRaffles - Final raffles:", raffles);

    return {
        raffles,
        error: idsError,
        isLoading: idsLoading,
    };
};

// Hook to get a single raffle with formatted data
export const useRaffle = (raffleId: number) => {
    console.log("🔍 useRaffle - Fetching raffle ID:", raffleId);
    console.log(
        "🔍 useRaffle - This is ONE of the N individual getRaffleData() calls"
    );
    const { data: raffleData, error, isLoading } = useRaffleData(raffleId);
    const [metadata, setMetadata] = useState<RaffleMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataError, setMetadataError] = useState<Error | null>(null);

    console.log("🔍 useRaffle - Raw raffle data:", raffleData);
    console.log("🔍 useRaffle - Error:", error);
    console.log("🔍 useRaffle - Loading:", isLoading);

    // Fetch metadata when raffle data is available
    useEffect(() => {
        if (raffleData && !isLoading) {
            const [, , description] = raffleData as unknown as any[];

            // Check if description is a Supabase URL
            if (
                typeof description === "string" &&
                description.includes("supabase")
            ) {
                setMetadataLoading(true);
                setMetadataError(null);

                // Extract record ID from URL
                const urlParts = description.split("id=eq.");
                const recordId = urlParts[1];

                if (recordId) {
                    MetadataService.getRaffleMetadata(recordId)
                        .then((fetchedMetadata) => {
                            setMetadata(fetchedMetadata);
                        })
                        .catch((err) => {
                            console.error("Error fetching metadata:", err);
                            setMetadataError(err);
                        })
                        .finally(() => {
                            setMetadataLoading(false);
                        });
                }
            }
        }
    }, [raffleData, isLoading]);

    const formattedRaffle = useMemo(() => {
        if (!raffleData) return null;

        const [
            id,
            creator,
            description,
            endTime,
            maxTickets,
            allowMultipleTickets,
            ticketPrice,
            ticketToken,
            totalTicketsSold,
            winner,
            winningTicketId,
            isActive,
            isFinalized,
            winningsWithdrawn,
        ] = raffleData as unknown as any[];

        // Calculate time remaining
        const now = Math.floor(Date.now() / 1000);
        const timeRemaining = Number(endTime) - now;

        const days = Math.floor(timeRemaining / (24 * 60 * 60));
        const hours = Math.floor((timeRemaining % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((timeRemaining % (60 * 60)) / 60);
        const seconds = timeRemaining % 60;

        // Calculate progress percentage
        const progress =
            maxTickets > 0
                ? (Number(totalTicketsSold) / Number(maxTickets)) * 100
                : 0;

        // Format ticket price
        const priceInEth = Number(ticketPrice) / 1e18;

        return {
            id: Number(id),
            creator,
            description: metadata?.title || description, // Use metadata title if available
            endTime: Number(endTime),
            maxTickets: Number(maxTickets),
            allowMultipleTickets,
            ticketPrice: priceInEth,
            ticketToken,
            totalTicketsSold: Number(totalTicketsSold),
            winner,
            winningTicketId: Number(winningTicketId),
            isActive,
            isFinalized,
            winningsWithdrawn,
            countdown: {
                days: days.toString().padStart(2, "0"),
                hours: hours.toString().padStart(2, "0"),
                minutes: minutes.toString().padStart(2, "0"),
                seconds: seconds.toString().padStart(2, "0"),
            },
            progress: Math.min(progress, 100),
            entries: Number(totalTicketsSold),
            ticketPriceFormatted: `${priceInEth.toFixed(3)} ETH`,
            prizeValue: metadata?.prizeValue || "TBD",
            prizeCurrency: metadata?.prizeCurrency || "ETH",
            buttonText: "Enter Raffle",
            image: metadata?.image || "/src/assets/cptpnk.png",
            // Include full metadata if available
            metadata,
        };
    }, [raffleData, metadata]);

    return {
        raffle: formattedRaffle,
        error: error || metadataError,
        isLoading: isLoading || metadataLoading,
    };
};
