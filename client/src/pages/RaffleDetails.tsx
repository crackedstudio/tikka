import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useRaffle } from "../hooks/useRaffles";
import RaffleDetailsCard from "../components/cards/RaffleDetailsCard";
import ShareRaffle from "../components/ShareRaffle";
import VerifiedBadge from "../components/VerifiedBadge";
import ErrorMessage from "../components/ui/ErrorMessage";
import NotificationSubscribeButton from "../components/NotificationSubscribeButton";
import EnterRaffleButton from "../components/EnterRaffleButton";
import detailimage from "../assets/detailimage.png";

const RaffleDetails = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const raffleId = id ?? searchParams.get("raffle");
    const parsedRaffleId = raffleId ? parseInt(raffleId, 10) : 0;

    const { raffle, error, isLoading, refetch } = useRaffle(parsedRaffleId);

    useEffect(() => {
        const handleFocus = () => refetch();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [refetch]);

    const statusLabel = raffle?.status?.toUpperCase() || "UNKNOWN";
    const lowerStatus = raffle?.status?.toLowerCase() || "";
    const isFinalized = lowerStatus === "closed" || lowerStatus === "finalized" || lowerStatus === "cancelled";
    const ctaLabel =
        lowerStatus === "cancelled"
            ? "Claim Refund"
            : raffle?.winner
              ? "View Winner"
              : isFinalized
                ? "Raffle Ended"
                : "Buy Ticket";

    if (isLoading) {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
                <div className="bg-white dark:bg-[#11172E] p-8 rounded-3xl animate-pulse">
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
                <div className="bg-white dark:bg-[#11172E] p-8 rounded-3xl">
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
                images={raffle.metadata?.images}
                title={raffle.metadata?.title || raffle.description}
                body={
                    raffle.metadata?.description || "No description available."
                }
                prizeValue={raffle.prizeValue}
                prizeCurrency={raffle.prizeCurrency}
                countdown={raffle.countdown}
                onEnter={() => {
                    console.log("Raffle CTA:", ctaLabel, raffle.id);
                }}
            />

            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Raffle Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Status</span>
                        <span className="text-gray-900 dark:text-white font-medium">{statusLabel}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Ticket Price</span>
                        <span className="text-gray-900 dark:text-white font-medium">{raffle.ticketPriceFormatted}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Tickets Sold</span>
                        <span className="text-gray-900 dark:text-white font-medium">{raffle.totalTicketsSold} / {raffle.maxTickets}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Ends At</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                            {new Date(raffle.endTime * 1000).toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Winner</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                            {raffle.winner || "-"}
                        </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                        <span className="text-gray-400">Category</span>
                        <span className="text-gray-900 dark:text-white font-medium">{raffle.metadata?.category || "General"}</span>
                    </div>
                </div>

                <div className="mt-6">
                    {isFinalized ? (
                        <button
                            className="border border-pink-500 dark:border-[#fe3796] px-8 py-3 rounded-xl hover:bg-[#fe3796]/10 transition"
                            onClick={() => console.log("Finalized raffle action:", raffle.id)}
                        >
                            {ctaLabel}
                        </button>
                    ) : (
                        <EnterRaffleButton
                            raffleId={raffle.id}
                            ticketPrice={raffle.ticketPrice}
                            className="border border-pink-500 dark:border-[#fe3796] px-8 py-3 rounded-xl hover:bg-[#fe3796]/10 transition"
                            onSuccess={() => refetch()}
                            onError={(message) => alert(message)}
                        >
                            {ctaLabel}
                        </EnterRaffleButton>
                    )}
                </div>
            </div>
            
            {/* Notification Subscription Section */}
            <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 mb-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Stay Updated</h3>
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
