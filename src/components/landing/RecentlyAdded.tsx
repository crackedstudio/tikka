import { CircleQuestionMark, Eye, MoveRight } from "lucide-react";
import ps5 from "../../assets/ps5.png";
import chainlink from "../../assets/chainlink.png";
import verified from "../../assets/verified.png";
import RecentlyAddedCard from "../cards/RecentlyAddedCard";

const RecentlyAdded = () => {
    const recentlyAddedList = [
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
        {
            image: ps5,
            title: "PS5 Pro Bundle",
            countdown: {
                days: "01",
                hours: "12",
                minutes: "45",
                seconds: "33",
            },
            ticketPrice: "0.01 ETH",
            entries: 335,
            progress: 50,
        },
    ];
    return (
        <div className="p-22">
            <div className="flex justify-between items-center mb-8">
                <h1 className="font-semibold text-4xl">Recently Added</h1>
                <button className="border border-[#fe3796] px-16 py-4 rounded-xl flex items-center space-x-4">
                    <Eye color="#fe3796" />

                    <span>See All</span>
                </button>
            </div>
            <div className="mt-8 grid grid-cols-4 gap-8">
                {recentlyAddedList.map((raffle, index) => (
                    <RecentlyAddedCard
                        key={index}
                        image={raffle.image}
                        title={raffle.title}
                        countdown={raffle.countdown}
                        ticketPrice={raffle.ticketPrice}
                        entries={raffle.entries}
                        progress={raffle.progress}
                    />
                ))}
            </div>
            <div className="flex justify-between items-center mt-16">
                <div className="w-[50%]">
                    <h1 className="flex items-center space-x-2">
                        <CircleQuestionMark color="#00E5FF" />
                        <span> Provably Fair Raffles</span>
                    </h1>
                    <p className="text-[#9CA3AF]">
                        VeriWin uses Chainlink VRF (Verifiable Random Function)
                        to ensure all winners are selected through a provably
                        fair and tamper-proof random selection process.
                    </p>

                    <p className="text-[#00E5FF] flex items-center space-x-2 cursor-pointer mt-2">
                        <span>Learn how our raffles work </span> <MoveRight />
                    </p>
                </div>
                <div className="flex space-x-4">
                    <div className="bg-[#19192B] p-4 flex space-x-3 items-center">
                        <img src={chainlink} alt="" />
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm">Powered by</p>
                            <p className="">Chainlink VRF</p>
                        </div>
                    </div>
                    <div className="bg-[#19192B] p-4 flex space-x-3 items-center">
                        <img src={verified} alt="" />
                        <div className="flex flex-col space-y-1">
                            <p className="text-sm">Smart Contract</p>
                            <p className="">Verified</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecentlyAdded;
