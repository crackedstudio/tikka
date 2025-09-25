import BrowseRaffles from "../components/home/BrowseRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import TrendingRaffles from "../components/landing/TrendingRaffles";
import { advancedRaffleList } from "../utils/dummy";
import VerifiedBadge from "../components/VerifiedBadge";
import RocketLaunch from "../assets/svg/RocketLaunch";

const Home = () => {
    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <BrowseRaffles />
            <FeaturedRaffle isSignedIn={true} />
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                <TrendingRaffles raffleList={advancedRaffleList} />
                <div className="w-full mt-5 flex justify-center">
                    <button className="bg-[#fe3796] px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 mx-auto md:mx-0">
                        <RocketLaunch />
                        <span>Load More</span>
                    </button>
                </div>
            </div>
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex justify-between">
                <VerifiedBadge />
            </div>
        </div>
    );
};

export default Home;
