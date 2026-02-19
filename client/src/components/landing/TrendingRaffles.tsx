import RaffleCard from "../cards/RaffleCard";
import TrendingTab from "./TrendingTab";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRaffle } from "../../hooks/useRaffles";

interface TrendingRafflesProps {
    raffleIds: number[];
}

const TrendingRaffles = ({ raffleIds }: TrendingRafflesProps) => {
    const [activeTab, setActiveTab] = useState("All Raffles");
    const navigate = useNavigate();

    return (
        <div>
            <TrendingTab
                activeTab={activeTab}
                changeActiveTab={() => setActiveTab}
            />
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {raffleIds.map((raffleId) => (
                    <RaffleCardWrapper
                        key={raffleId}
                        raffleId={raffleId}
                        onEnter={() => navigate(`/details?raffle=${raffleId}`)}
                    />
                ))}
            </div>
        </div>
    );
};

// Wrapper component to fetch individual raffle data
const RaffleCardWrapper: React.FC<{
    raffleId: number;
    onEnter: () => void;
}> = ({ raffleId, onEnter }) => {
    const { raffle, error, isLoading } = useRaffle(raffleId);

    if (isLoading) {
        return (
            <div className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 animate-pulse">
                <div className="w-full h-48 bg-gray-700 rounded-3xl"></div>
                <div className="h-6 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-700 rounded"></div>
                <div className="h-12 bg-gray-700 rounded-xl"></div>
            </div>
        );
    }

    if (error || !raffle) {
        console.log("🔍 RaffleCardWrapper - Error or no raffle data:", {
            raffleId,
            error,
            raffle,
        });
        return (
            <div className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4">
                <div className="text-red-400 text-center">
                    Error loading raffle #{raffleId}
                </div>
                {error && (
                    <div className="text-gray-400 text-xs text-center">
                        {error.message || "Unknown error"}
                    </div>
                )}
            </div>
        );
    }

    return (
        <RaffleCard
            image={raffle.image}
            title={raffle.description}
            prizeValue={raffle.prizeValue}
            prizeCurrency={raffle.prizeCurrency}
            countdown={raffle.countdown}
            ticketPrice={raffle.ticketPriceFormatted}
            entries={raffle.entries}
            progress={raffle.progress}
            buttonText={raffle.buttonText}
            raffleId={raffle.id}
            onEnter={onEnter}
        />
    );
};

export default TrendingRaffles;
