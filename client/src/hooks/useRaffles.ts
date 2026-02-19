import { useMemo } from "react";
import { demoRaffles } from "../data/demoRaffles";

// Hook to get all active raffles with their data
export const useActiveRaffles = () => {
    const raffles = useMemo(
        () => demoRaffles.filter((raffle) => raffle.isActive).map((r) => r.id),
        []
    );

    return {
        raffles,
        error: null,
        isLoading: false,
    };
};

// Hook to get a single raffle with formatted data
export const useRaffle = (raffleId: number) => {
    const raffle = useMemo(() => {
        const raffleData = demoRaffles.find((item) => item.id === raffleId);
        if (!raffleData) return null;

        const timeRemaining = raffleData.endTime - Math.floor(Date.now() / 1000);
        const days = Math.max(0, Math.floor(timeRemaining / (24 * 60 * 60)));
        const hours = Math.max(
            0,
            Math.floor((timeRemaining % (24 * 60 * 60)) / (60 * 60))
        );
        const minutes = Math.max(
            0,
            Math.floor((timeRemaining % (24 * 60 * 60)) / 60)
        );
        const seconds = Math.max(0, timeRemaining % 60);

        const progress =
            raffleData.maxTickets > 0
                ? (raffleData.totalTicketsSold / raffleData.maxTickets) * 100
                : 0;

        return {
            id: raffleData.id,
            creator: "demo",
            description: raffleData.title,
            endTime: raffleData.endTime,
            maxTickets: raffleData.maxTickets,
            allowMultipleTickets: true,
            ticketPrice: raffleData.ticketPriceEth,
            ticketToken: undefined,
            totalTicketsSold: raffleData.totalTicketsSold,
            winner: null,
            winningTicketId: 0,
            isActive: raffleData.isActive,
            isFinalized: !raffleData.isActive,
            winningsWithdrawn: false,
            countdown: {
                days: days.toString().padStart(2, "0"),
                hours: hours.toString().padStart(2, "0"),
                minutes: minutes.toString().padStart(2, "0"),
                seconds: seconds.toString().padStart(2, "0"),
            },
            progress: Math.min(progress, 100),
            entries: raffleData.totalTicketsSold,
            ticketPriceFormatted: `${raffleData.ticketPriceEth.toFixed(3)} ETH`,
            prizeValue: raffleData.prizeValue,
            prizeCurrency: raffleData.prizeCurrency,
            buttonText: "Enter Raffle",
            image: raffleData.image,
            metadata: {
                title: raffleData.title,
                description: raffleData.description,
                image: raffleData.image,
                prizeName: raffleData.title,
                prizeValue: raffleData.prizeValue,
                prizeCurrency: raffleData.prizeCurrency,
                category: raffleData.tags[0] || "General",
                tags: raffleData.tags,
                createdBy: "demo",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        };
    }, [raffleId]);

    return {
        raffle,
        error: raffle ? null : new Error("Demo raffle not found."),
        isLoading: false,
    };
};
