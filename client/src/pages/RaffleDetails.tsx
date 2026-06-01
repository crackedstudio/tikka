import { useParams, useSearchParams } from "react-router-dom";
import { useWalletContext } from "../providers/WalletProvider";
import { useRaffleDetailsData } from "../hooks/useRaffleDetailsData";
import RaffleDetailsCard from "../components/cards/RaffleDetailsCard";
import ShareRaffle from "../components/ShareRaffle";
import VerifiedBadge from "../components/VerifiedBadge";
import ErrorMessage from "../components/ui/ErrorMessage";
import RaffleTicketPurchaseSection from "../components/RaffleTicketPurchaseSection";
import RaffleMetadataSection from "../components/RaffleMetadataSection";
import RaffleNotificationSection from "../components/RaffleNotificationSection";
import RaffleWinnerBanner from "../components/RaffleWinnerBanner";
import detailimage from "../assets/detailimage.png";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { Helmet } from "react-helmet-async";

const RaffleDetails = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const raffleId = id ?? searchParams.get("raffle");
    const parsedRaffleId = raffleId ? parseInt(raffleId, 10) : 0;
    const { address } = useWalletContext();

    const { raffle, error, isLoading, refetch } = useRaffleDetailsData(parsedRaffleId);
    const isWinner = raffle?.winner && address === raffle.winner;

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

            <RaffleWinnerBanner isWinner={isWinner} />

            <RaffleDetailsCard
                raffleId={raffle.id}
                image={raffle.image || detailimage}
                images={raffle.metadata?.images}
                title={raffle.metadata?.title || raffle.description}
                body={raffle.description || "No description available."}
                prizeValue={raffle.prizeValue}
                prizeCurrency={raffle.prizeCurrency}
                endTime={raffle.endTime}
                onEnter={() => {
                    console.log("Raffle CTA:", raffle.status, raffle.id);
                }}
            />

            <RaffleMetadataSection raffle={raffle} />

            <RaffleTicketPurchaseSection
                raffleId={raffle.id}
                ticketPrice={raffle.ticketPrice}
                status={raffle.status}
                winner={raffle.winner}
                onSuccess={() => refetch()}
            />

            <RaffleNotificationSection raffleId={raffle.id} />

            <VerifiedBadge />
            <ShareRaffle
                raffleId={raffle.id}
                title={raffle.metadata?.title || raffle.description || "Raffle"}
            />
        </div>
    );
};

export default RaffleDetails;
