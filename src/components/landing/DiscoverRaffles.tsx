import { Eye } from "lucide-react";
import TrendingRaffles from "./TrendingRaffles";

const DiscoverRaffles = () => {
    return (
        <div className="px-22">
            <div className="flex justify-between">
                <div>
                    <h2 className="text-4xl font-semibold mb-4">
                        Catch Your Next Opportunity
                    </h2>
                    <p>Explore New Trending Raffles</p>
                </div>
                <button>
                    <button className="border border-[#fe3796] px-16 py-4 rounded-xl flex items-center space-x-4">
                        <Eye color="#fe3796" />

                        <span>See All</span>
                    </button>
                </button>
            </div>
            <TrendingRaffles />
        </div>
    );
};

export default DiscoverRaffles;
