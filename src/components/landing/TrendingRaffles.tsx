import RaffleCard from "../cards/RaffleCard";
import TrendingTab from "./TrendingTab";
import cptpnk from "../../assets/cptpnk.png";
import teslmdl from "../../assets/teslmdl.png";

const TrendingRaffles = () => {
    const [activeTab, setActiveTab] = "All Raffles";
    const raffleList = [
        {
            image: cptpnk,
            title: "Rare Crypto Punk #3842",
            prizeValue: "12.5",
            prizeCurrency: "ETH",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 782,
            progress: 70,
            buttonText: "Enter Now",
        },
        {
            image: teslmdl,
            title: "Tesla Model 3 Givaway",
            prizeValue: "8.3",
            prizeCurrency: "ETH",
            countdown: {
                days: "00",
                hours: "18",
                minutes: "22",
                seconds: "59",
            },
            ticketPrice: "0.02 ETH",
            entries: 410,
            progress: 40,
            buttonText: "Join Raffle",
        },
        {
            image: cptpnk,
            title: "1 Bitcoin Jackpot",
            prizeValue: "25",
            prizeCurrency: "ETH",
            countdown: {
                days: "02",
                hours: "06",
                minutes: "12",
                seconds: "11",
            },
            ticketPrice: "0.1 ETH",
            entries: 1220,
            progress: 85,
            buttonText: "Enter Raffle",
        },
    ];
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
