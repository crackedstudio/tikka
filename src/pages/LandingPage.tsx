import DiscoverRaffles from "../components/landing/DiscoverRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import Hero from "../components/landing/Hero";
import RecentlyAdded from "../components/landing/RecentlyAdded";

const LandingPage = () => {
    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <Hero handleStartClick={() => console.log("clicked")} />
            <DiscoverRaffles />
            <FeaturedRaffle isSignedIn={false} />
            <RecentlyAdded />
        </div>
    );
};

export default LandingPage;
