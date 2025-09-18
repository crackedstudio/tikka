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
        <section className="w-full">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-12">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
                    <h1 className="font-semibold text-3xl md:text-4xl">
                        Recently Added
                    </h1>

                    <button className="inline-flex items-center gap-3 rounded-xl px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 border border-[#FE3796]">
                        <Eye className="h-5 w-5" />
                        <span>See All</span>
                    </button>
                </div>

                {/* Grid */}
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
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

                {/* Info + Badges */}
                <div className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
                    {/* Left: copy */}
                    <div className="lg:w-1/2">
                        <h2 className="flex items-center gap-2 text-xl md:text-2xl font-semibold">
                            <CircleQuestionMark color="#00E5FF" />
                            <span>Provably Fair Raffles</span>
                        </h2>

                        <p className="text-[#9CA3AF] mt-3">
                            VeriWin uses Chainlink VRF (Verifiable Random
                            Function) to ensure all winners are selected through
                            a provably fair and tamper-proof random selection
                            process.
                        </p>

                        <button className="mt-3 inline-flex items-center gap-2 text-[#00E5FF] hover:underline">
                            <span>Learn how our raffles work</span>{" "}
                            <MoveRight />
                        </button>
                    </div>

                    {/* Right: badges */}
                    <div className="flex gap-4 lg:w-auto">
                        <div className="bg-[#19192B] p-4 rounded-xl flex items-center gap-3">
                            <img
                                src={chainlink}
                                alt="Chainlink VRF"
                                className="h-10 w-10"
                            />
                            <div className="flex flex-col leading-tight">
                                <p className="text-xs md:text-sm text-white/70">
                                    Powered by
                                </p>
                                <p className="font-medium md:text-lg text-sm">
                                    Chainlink VRF
                                </p>
                            </div>
                        </div>

                        <div className="bg-[#19192B] p-4 rounded-xl flex items-center gap-3">
                            <img
                                src={verified}
                                alt="Verified Contract"
                                className="h-10 w-10"
                            />
                            <div className="flex flex-col leading-tight">
                                <p className="text-sm text-white/70">
                                    Smart Contract
                                </p>
                                <p className="font-medium">Verified</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default RecentlyAdded;
