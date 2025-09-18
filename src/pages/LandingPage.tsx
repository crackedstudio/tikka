import DiscoverRaffles from "../components/landing/DiscoverRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import Footer from "../components/landing/Footer";
import Hero from "../components/landing/Hero";
import RecentlyAdded from "../components/landing/RecentlyAdded";
import Navbar from "../components/Navbar";

const LandingPage = () => {
    return (
        <div className="bg-[#060C23] text-white py-10 flex flex-col space-y-16">
            <Navbar />
            <Hero />
            <DiscoverRaffles />
            <FeaturedRaffle />
            <RecentlyAdded />
            <Footer />
        </div>
    );
};

export default LandingPage;
