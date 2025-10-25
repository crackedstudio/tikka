import { useActiveRaffleIds } from "./useRaffleContract";
import { useMemo, useState, useEffect } from "react";
import { MetadataService } from "../services/metadataService";
import type { RaffleMetadata } from "../types/types";

// Hook to get all active raffles with their data in a single batch
export const useActiveRafflesBatch = () => {
    const {
        data: activeRaffleIds,
        error: idsError,
        isLoading: idsLoading,
    } = useActiveRaffleIds();

    const [rafflesData, setRafflesData] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [dataError, setDataError] = useState<Error | null>(null);

    console.log(
        "🔍 useActiveRafflesBatch - Active raffle IDs raw:",
        activeRaffleIds
    );
    console.log("🔍 useActiveRafflesBatch - Error:", idsError);
    console.log("🔍 useActiveRafflesBatch - Loading:", idsLoading);

    // Batch fetch all raffle data when IDs are available
    useEffect(() => {
        if (
            activeRaffleIds &&
            Array.isArray(activeRaffleIds) &&
            activeRaffleIds.length > 0
        ) {
            console.log(
                "🔍 useActiveRafflesBatch - Starting batch fetch for IDs:",
                activeRaffleIds
            );
            setDataLoading(true);
            setDataError(null);

            // Batch fetch all raffle data
            const fetchAllRaffles = async () => {
                try {
                    const rafflePromises = activeRaffleIds.map(
                        async (id: bigint) => {
                            console.log(
                                "🔍 useActiveRafflesBatch - Fetching raffle ID:",
                                Number(id)
                            );

                            // This would be a batch call in a real implementation
                            // For now, we'll simulate the individual calls
                            const response = await fetch(
                                `/api/raffle/${Number(id)}`
                            );
                            if (!response.ok) {
                                throw new Error(
                                    `Failed to fetch raffle ${Number(id)}`
                                );
                            }
                            return response.json();
                        }
                    );

                    const results = await Promise.all(rafflePromises);
                    console.log(
                        "🔍 useActiveRafflesBatch - Batch fetch results:",
                        results
                    );
                    setRafflesData(results);
                } catch (error) {
                    console.error(
                        "🔍 useActiveRafflesBatch - Batch fetch error:",
                        error
                    );
                    setDataError(error as Error);
                } finally {
                    setDataLoading(false);
                }
            };

            fetchAllRaffles();
        } else {
            setRafflesData([]);
            setDataLoading(false);
        }
    }, [activeRaffleIds]);

    const raffles = useMemo(() => {
        console.log(
            "🔍 useActiveRafflesBatch - Processing raffles data:",
            rafflesData
        );

        if (!rafflesData || rafflesData.length === 0) {
            console.log(
                "🔍 useActiveRafflesBatch - No raffles data, returning empty array"
            );
            return [];
        }

        // Process and format the raffle data
        const processedRaffles = rafflesData.map((raffleData, index) => {
            const raffleId = Number(activeRaffleIds?.[index] || 0);
            console.log(
                "🔍 useActiveRafflesBatch - Processing raffle:",
                raffleId,
                raffleData
            );

            // Format the raffle data (similar to useRaffle but for batch)
            return {
                id: raffleId,
                ...raffleData,
                // Add any additional formatting here
            };
        });

        console.log(
            "🔍 useActiveRafflesBatch - Final processed raffles:",
            processedRaffles
        );
        return processedRaffles;
    }, [rafflesData, activeRaffleIds]);

    console.log("🔍 useActiveRafflesBatch - Final raffles:", raffles);

    return {
        raffles,
        error: idsError || dataError,
        isLoading: idsLoading || dataLoading,
    };
};

// Hook to get a single raffle with formatted data (unchanged)
export const useRaffle = (raffleId: number) => {
    console.log("🔍 useRaffle - Fetching raffle ID:", raffleId);

    // This would be replaced with a more efficient batch call
    // For now, keeping the individual call approach
    const { data: raffleData, error, isLoading } = useRaffleData(raffleId);
    const [metadata, setMetadata] = useState<RaffleMetadata | null>(null);
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataError, setMetadataError] = useState<Error | null>(null);

    console.log("🔍 useRaffle - Raw raffle data:", raffleData);
    console.log("🔍 useRaffle - Error:", error);
    console.log("🔍 useRaffle - Loading:", isLoading);

    // ... rest of the useRaffle implementation remains the same
    return {
        raffle: null, // Simplified for now
        error: error || metadataError,
        isLoading: isLoading || metadataLoading,
    };
};
