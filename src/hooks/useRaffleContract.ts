import {
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import {
    RAFFLE_CONTRACT_ADDRESS,
    RAFFLE_CONTRACT_ABI,
} from "../config/contract";

export const useRaffleContract = () => {
    const { writeContract, data: hash, error, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } =
        useWaitForTransactionReceipt({
            hash,
        });

    return {
        writeContract,
        hash,
        error,
        isPending,
        isConfirming,
        isConfirmed,
    };
};

// Hook for reading raffle data
export const useRaffleData = (raffleId: number) => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getRaffleData",
        args: [BigInt(raffleId)],
    });

    console.log("🔍 useRaffleData - Raffle ID:", raffleId);
    console.log("🔍 useRaffleData - Raw data:", data);
    console.log("🔍 useRaffleData - Error:", error);
    console.log("🔍 useRaffleData - Loading:", isLoading);

    return { data, error, isLoading };
};

// Hook for reading all raffle IDs
export const useAllRaffleIds = () => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getAllRaffleIds",
    });

    console.log("🔍 useAllRaffleIds - Raw data:", data);
    console.log("🔍 useAllRaffleIds - Error:", error);
    console.log("🔍 useAllRaffleIds - Loading:", isLoading);

    return { data, error, isLoading };
};

// Hook for reading active raffle IDs
export const useActiveRaffleIds = () => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getActiveRaffleIds",
    });

    console.log("🔍 useActiveRaffleIds - Raw data:", data);
    console.log("🔍 useActiveRaffleIds - Error:", error);
    console.log("🔍 useActiveRaffleIds - Loading:", isLoading);

    return { data, error, isLoading };
};

// Hook for reading user's raffle participation
export const useUserRaffleParticipation = (userAddress: string) => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getUserRaffleParticipation",
        args: [userAddress as `0x${string}`],
    });

    console.log("🔍 useUserRaffleParticipation - User address:", userAddress);
    console.log("🔍 useUserRaffleParticipation - Raw data:", data);
    console.log("🔍 useUserRaffleParticipation - Error:", error);
    console.log("🔍 useUserRaffleParticipation - Loading:", isLoading);

    return { data, error, isLoading };
};

// Hook for reading raffle statistics
export const useRaffleStatistics = (raffleId: number) => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getRaffleStatistics",
        args: [BigInt(raffleId)],
    });

    return { data, error, isLoading };
};

// Hook for reading platform statistics
export const usePlatformStatistics = () => {
    const { data, error, isLoading } = useReadContract({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: RAFFLE_CONTRACT_ABI,
        functionName: "getPlatformStatistics",
    });

    return { data, error, isLoading };
};
