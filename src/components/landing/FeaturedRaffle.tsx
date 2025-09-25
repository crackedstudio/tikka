import FeaturedRaffleCard from "../cards/FeaturedRaffleCard";
import featraff from "../../assets/featraff.png";
import RocketLaunch from "../../assets/svg/RocketLaunch";

interface FeaturedRaffleProps {
    isSignedIn: boolean;
}

const FeaturedRaffle = ({ isSignedIn }: FeaturedRaffleProps) => {
    return (
        <section className="w-full bg-[#11172E] py-12">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
                {/* Heading */}
                <h1 className="text-3xl md:text-4xl font-semibold text-center md:text-left">
                    Featured Raffle
                </h1>

                {/* Card */}
                <div className="mt-8">
                    <FeaturedRaffleCard
                        image={featraff}
                        title="Rare Crypto Punk #3842"
                        body={`Win a 7-day all-inclusive stay at a 5-star resort in Bali, including flights 
and activities for two people.`}
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
                </div>

                {/* CTA Row */}
                {!isSignedIn && (
                    <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-8">
                        <a
                            href="#get-started"
                            className="rounded-xl px-10 py-4 text-white font-medium inline-flex items-center justify-center gap-3 transition hover:brightness-110 bg-[#FE3796]"
                        >
                            <RocketLaunch />
                            <span>Get Started</span>
                        </a>

                        <p className="font-semibold text-lg md:text-2xl text-center md:text-left">
                            Sign up now to host raffles or join raffles
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
};

export default FeaturedRaffle;
