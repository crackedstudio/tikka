import { claimPrize as claimPrizeTx } from "./contractService";

export interface ClaimPrizeParams {
    raffleId: number;
}

export interface ClaimPrizeResult {
    transactionHash: string;
}

export const TicketService = {
    async claimPrize({ raffleId }: ClaimPrizeParams): Promise<ClaimPrizeResult> {
        const result = await claimPrizeTx({ raffleId });

        if (!result.ok) {
            throw new Error(result.error.message);
        }

        return {
            transactionHash: result.data.txHash,
        };
    },
};
