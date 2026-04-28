import RaffleCard from "../cards/RaffleCard";
import RaffleCardSkeleton from "../cards/RaffleCardSkeleton";
import TrendingTab from "./TrendingTab";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRaffle } from "../../hooks/useRaffles";
import RaffleCardSkeleton from "../ui/RaffleCardSkeleton";
import ErrorMessage from "../ui/ErrorMessage";

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
        return <RaffleCardSkeleton />;
    }

    if (error || !raffle) {
        return (
            <div className="w-full bg-[#11172E] p-4 rounded-3xl">
                <ErrorMessage
                    variant="inline"
                    title={`Error loading raffle #${raffleId}`}
                    message={error?.message}
                />
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
