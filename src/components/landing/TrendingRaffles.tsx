import { basicRaffleList } from "../../utils/dummy";
import RaffleCard from "../cards/RaffleCard";
import TrendingTab from "./TrendingTab";
import { useState } from "react";

interface TrendingRafflesProps {
    raffleList: typeof basicRaffleList;
}

const TrendingRaffles = ({ raffleList }: TrendingRafflesProps) => {
    const [activeTab, setActiveTab] = useState("All Raffles");

    return (
        <div>
            <TrendingTab
                activeTab={activeTab}
                changeActiveTab={() => setActiveTab}
            />
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {raffleList.map((raffle, index) => (
                    <RaffleCard
                        key={index} // ideally use raffle.id if you have one
                        image={raffle.image}
                        title={raffle.title}
                        prizeValue={raffle.prizeValue}
                        prizeCurrency={raffle.prizeCurrency}
                        countdown={raffle.countdown}
                        ticketPrice={raffle.ticketPrice}
                        entries={raffle.entries}
                        progress={raffle.progress}
                        buttonText={raffle.buttonText}
                        onEnter={() => alert(`Entering ${raffle.title}`)}
                    />
                ))}
            </div>
        </div>
    );
};

export default TrendingRaffles;
