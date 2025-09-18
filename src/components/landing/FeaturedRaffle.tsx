import FeaturedRaffleCard from "../cards/FeaturedRaffleCard";
import featraff from "../../assets/featraff.png";
import RocketLaunch from "../../assets/svg/RocketLaunch";

const FeaturedRaffle = () => {
    return (
        <div className="bg-[#11172E] p-22">
            <h1 className="text-4xl font-semibold">Featured Raffle</h1>
            <FeaturedRaffleCard
                image={featraff}
                title="Rare Crypto Punk #3842"
                body="Win a 7-day all-inclusive stay at a 5-star resort in Bali, including flights 
and activities for two people."
                prizeValue="12.5"
                prizeCurrency="ETH"
                countdown={{
                    days: "01",
                    hours: "12",
                    minutes: "45",
                    seconds: "33",
                }}
                ticketPrice="0.01 ETH"
                entries={782}
                progress={70}
                buttonText="Enter Raffle"
                onEnter={() => alert("Entering raffle...")}
            />
            <div className="mt-12 flex space-x-8 items-center">
                <button className="bg-[#fe3796] px-16 py-4 rounded-xl flex items-center space-x-4">
                    <RocketLaunch />
                    <span>Get Started</span>
                </button>
                <p className="font-semibold text-2xl">
                    Sign up now to Host raffles or join raffles
                </p>
            </div>
        </div>
    );
};

export default FeaturedRaffle;
