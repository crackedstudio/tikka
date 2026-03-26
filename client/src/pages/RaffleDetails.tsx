import { useSearchParams } from "react-router-dom";
import { useRaffle } from "../hooks/useRaffles";
import RaffleDetailsCard from "../components/cards/RaffleDetailsCard";
import ShareRaffle from "../components/ShareRaffle";
import VerifiedBadge from "../components/VerifiedBadge";
import ErrorMessage from "../components/ui/ErrorMessage";
import NotificationSubscribeButton from "../components/NotificationSubscribeButton";
import detailimage from "../assets/detailimage.png";

const RaffleDetails = () => {
    const [searchParams] = useSearchParams();
    const raffleId = searchParams.get("raffle");

    const { raffle, error, isLoading } = useRaffle(
        raffleId ? parseInt(raffleId) : 0
    );

    if (isLoading) {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                <div className="bg-[#11172E] p-8 rounded-3xl animate-pulse">
                    <div className="w-full h-64 bg-gray-700 rounded-3xl mb-6"></div>
                    <div className="h-8 bg-gray-700 rounded mb-4"></div>
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="h-4 bg-gray-700 rounded mb-6"></div>
                    <div className="h-12 bg-gray-700 rounded-xl"></div>
                </div>
            </div>
        );
    }

    if (error || !raffle) {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                <div className="bg-[#11172E] p-8 rounded-3xl">
                    <ErrorMessage
                        title="Raffle Not Found"
                        message={
                            error
                                ? error.message
                                : "The raffle you're looking for doesn't exist."
                        }
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
            <RaffleDetailsCard
                image={raffle.image || detailimage}
                title={raffle.description}
                body={
                    raffle.metadata?.description || "No description available."
                }
                prizeValue={raffle.prizeValue}
                prizeCurrency={raffle.prizeCurrency}
                countdown={raffle.countdown}
                onEnter={() => {
                    console.log("Entering raffle:", raffle.id);
                    // You can add navigation to enter raffle flow here
                }}
            />
            
            {/* Notification Subscription Section */}
            <div className="bg-[#11172E] rounded-3xl p-6 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-2">Stay Updated</h3>
                        <p className="text-gray-400 text-sm">
                            Get notified when this raffle ends or when you win
                        </p>
                    </div>
                    <NotificationSubscribeButton
                        raffleId={raffle.id}
                        onAuthRequired={() => {
                            alert('Please sign in to subscribe to notifications');
                        }}
                    />
                </div>
            </div>

            <VerifiedBadge />
            <ShareRaffle />
        </div>
    );
};

export default RaffleDetails;
