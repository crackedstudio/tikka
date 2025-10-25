import BrowseRaffles from "../components/home/BrowseRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import TrendingRaffles from "../components/landing/TrendingRaffles";
import VerifiedBadge from "../components/VerifiedBadge";
import RocketLaunch from "../assets/svg/RocketLaunch";
import ContractTest from "../components/ContractTest";
import { useState } from "react";
import { useActiveRaffles } from "../hooks/useRaffles";

const Home = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { raffles, error, isLoading: rafflesLoading } = useActiveRaffles();

    console.log("🔍 Home Page - Raffles:", raffles);
    console.log("🔍 Home Page - Error:", error);
    console.log("🔍 Home Page - Loading:", rafflesLoading);

    const handleLoadMore = async () => {
        setIsLoading(true);
        // In a real app, this would load more raffles from the contract
        // For now, we'll just simulate loading
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setIsLoading(false);
        console.log("Loading more raffles from contract...");
    };

    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <ContractTest />
            <BrowseRaffles />
            <FeaturedRaffle isSignedIn={true} />
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                {rafflesLoading ? (
                    <div className="text-center py-12">
                        <div className="text-white text-lg">
                            Loading raffles from blockchain...
                        </div>
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <div className="text-red-400 text-lg">
                            Error loading raffles: {error.message}
                        </div>
                    </div>
                ) : raffles.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-white text-lg">
                            No active raffles found
                        </div>
                        <div className="text-gray-400 text-sm mt-2">
                            Be the first to create a raffle!
                        </div>
                    </div>
                ) : (
                    <>
                        <TrendingRaffles raffleIds={raffles} />
                        <div className="w-full mt-5 flex justify-center">
                            <button
                                onClick={handleLoadMore}
                                disabled={isLoading}
                                className="bg-[#fe3796] hover:bg-[#fe3796]/90 disabled:opacity-50 disabled:cursor-not-allowed px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 mx-auto md:mx-0 transition-colors duration-200"
                            >
                                <RocketLaunch />
                                <span>
                                    {isLoading ? "Loading..." : "Load More"}
                                </span>
                            </button>
                        </div>
                    </>
                )}
            </div>
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex justify-between">
                <VerifiedBadge />
            </div>
        </div>
    );
};

export default Home;
