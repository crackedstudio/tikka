import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useWalletContext } from "../providers/WalletProvider";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useRaffle } from "../hooks/useRaffles";
import RaffleDetailsCard from "../components/cards/RaffleDetailsCard";
import ShareRaffle from "../components/ShareRaffle";
import VerifiedBadge from "../components/VerifiedBadge";
import ErrorMessage from "../components/ui/ErrorMessage";
import NotificationSubscribeButton from "../components/NotificationSubscribeButton";
import EnterRaffleButton from "../components/EnterRaffleButton";
import detailimage from "../assets/detailimage.png";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { Helmet } from "react-helmet-async";

const RaffleDetails = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const raffleId = id ?? searchParams.get("raffle");
    const parsedRaffleId = raffleId ? parseInt(raffleId, 10) : 0;
    const { address } = useWalletContext();
    const hasCelebrated = useRef(false);

    const { raffle, error, isLoading, refetch } = useRaffle(parsedRaffleId);

    useEffect(() => {
        const handleFocus = () => refetch();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [refetch]);

    useEffect(() => {
        if (raffle?.winner && address === raffle.winner && !hasCelebrated.current) {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
            }, 250);

            hasCelebrated.current = true;
        }
    }, [raffle?.winner, address]);

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

    const ogTitle = raffle.metadata?.title || raffle.description || `Raffle #${raffle.id}`;
    const ogDescription = raffle.description || "Join this raffle on Tikka — Decentralized Raffles on Stellar.";
    const ogImage = raffle.image || `${window.location.origin}/og-image.png`;

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 flex flex-col">
            <Helmet>
                <title>{ogTitle} | Tikka Raffles</title>
                <meta name="description" content={ogDescription} />
                
                {/* Open Graph */}
                <meta property="og:title" content={`${ogTitle} | Tikka Raffles`} />
                <meta property="og:description" content={ogDescription} />
                <meta property="og:image" content={ogImage} />
                <meta property="og:url" content={window.location.href} />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Tikka" />
                
                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={`${ogTitle} | Tikka Raffles`} />
                <meta name="twitter:description" content={ogDescription} />
                <meta name="twitter:image" content={ogImage} />
                <meta name="twitter:site" content="@tikaborofficial" />
                <meta name="twitter:creator" content="@tikaborofficial" />
            </Helmet>
            <div className="mb-4">
                <Breadcrumbs
                    items={[
                        { label: 'Home', href: '/home' },
                        { label: 'Explore', href: '/search' },
                        { label: raffle.metadata?.title || 'Raffle Details' }
                    ]}
                />
            </div>

            {raffle?.winner && address === raffle.winner && (
                <div className="bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 p-1 rounded-3xl mb-6 animate-pulse">
                    <div className="bg-white dark:bg-[#11172E] rounded-[22px] p-8 text-center shadow-2xl">
                        <div className="text-5xl mb-4">🏆</div>
                        <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">
                            CONGRATULATIONS!
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-pink-200 font-medium">
                            You are the winner of this raffle! 🎉
                        </p>
                    </div>
                </div>
            )}

            <RaffleDetailsCard
                image={raffle.image || detailimage}
                images={raffle.metadata?.images}
                title={raffle.metadata?.title || raffle.description}
                body={
                    raffle.description || "No description available."
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
                            onError={(message) => toast.error(message)}
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
                            toast.info('Sign in required', {
                                description: 'Please connect your wallet and sign in to subscribe to notifications.',
                            });
                        }}
                    />
                </div>
            </div>

            <VerifiedBadge />
            <ShareRaffle
                raffleId={raffle.id}
                title={raffle.metadata?.title || raffle.description || "Raffle"}
            />
        </div>
    );
};

export default RaffleDetails;
