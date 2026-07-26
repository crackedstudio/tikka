import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ContractService } from "../services/contractService";
import { MetadataService } from "../services/metadataService";
import type { BuyTicketParams, RaffleMetadata } from "../types/types";
import { queryKeys } from "../utils/queryKeys";

export const useBuyTicketsMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (params: BuyTicketParams) => ContractService.buyTickets(params),
        onSuccess: (_, variables) => {
            // Invalidate the detail of the raffle we just bought tickets for
            queryClient.invalidateQueries({ queryKey: queryKeys.raffles.detail(variables.raffleId) });
            // Invalidate the list of raffles to get updated ticket counts
            queryClient.invalidateQueries({ queryKey: queryKeys.raffles.all() });
            // Invalidate user history to reflect the purchase
            queryClient.invalidateQueries({ queryKey: queryKeys.users.profile("") }); // Note: We might want a more specific invalidation here if we had the user address in variables
        },
    });
};

export const useUploadMetadataMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (metadata: RaffleMetadata) => MetadataService.uploadRaffleMetadata(metadata),
        onSuccess: () => {
            // Invalidate the list of raffles since a new one was likely created
            queryClient.invalidateQueries({ queryKey: queryKeys.raffles.all() });
        },
    });
};

export const useUpdateMetadataMutation = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ recordId, metadata }: { recordId: string; metadata: Partial<RaffleMetadata> }) => 
            MetadataService.updateRaffleMetadata(recordId, metadata),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.raffles.all() });
        },
    });
};
