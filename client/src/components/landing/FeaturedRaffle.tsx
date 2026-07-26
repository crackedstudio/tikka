import FeaturedRaffleCard from "../cards/FeaturedRaffleCard";
import featraff from "../../assets/featraff.png";
import RocketLaunch from "../../assets/svg/RocketLaunch";
import type { RaffleCardViewModel } from "../cards/raffleCardViewModel";

interface FeaturedRaffleProps {
    isSignedIn: boolean;
}

// Static demo ViewModel — not fetched from the API.
// countdown is fixed display text; endTimeUnix drives the calendar widget.
const DEMO_END_TIME =
    Math.floor(Date.now() / 1000) + 86400 + 12 * 3600 + 45 * 60 + 33;

const DEMO_RAFFLE: RaffleCardViewModel = {
    raffleId: 0,
    title: "Rare Crypto Punk #3842",
    description:
        "Win a 7-day all-inclusive stay at a 5-star resort in Bali, including flights and activities for two people.",
    imageUrl: featraff,
    status: "live",
    statusLabel: "Live",
    ticketPrice: "0.010 ETH",
    ticketAsset: "ETH",
    prizeValue: "12.5",
    prizeCurrency: "ETH",
    entries: 782,
    maxTickets: 1117,
    progress: 70,
    endTimeUnix: DEMO_END_TIME,
    countdown: { days: "01", hours: "12", minutes: "45", seconds: "33" },
    winner: null,
    buttonText: "Enter Raffle",
};

const FeaturedRaffle = ({ isSignedIn }: FeaturedRaffleProps) => {
    return (
        <section className="w-full bg-white dark:bg-[#11172E] py-12">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16">
                {/* Heading */}
                <h1 className="text-3xl md:text-4xl font-semibold text-center md:text-left">
                    Featured Raffle
                </h1>

                {/* Card */}
                <div className="mt-8">
                    <FeaturedRaffleCard
                        viewModel={DEMO_RAFFLE}
                        onEnter={() => alert("Entering raffle...")}
                    />
                </div>

                {/* CTA Row */}
                {!isSignedIn && (
                    <div className="mt-12 flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-8">
                        <a
                            href="#get-started"
                            className="rounded-xl px-10 py-4 text-gray-900 dark:text-white font-medium inline-flex items-center justify-center gap-3 transition hover:brightness-110 bg-[#FE3796]"
                        >
                            <RocketLaunch />
                            <span>Get Started</span>
                        </a>
                    </div>
                )}
            </div>
        </section>
    );
};

export default FeaturedRaffle;
