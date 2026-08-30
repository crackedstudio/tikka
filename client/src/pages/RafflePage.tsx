import { useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRaffle } from "../hooks/useRaffles";
import { useAuth } from "../hooks/useAuth";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { ErrorMessage } from "../components/ui/ErrorMessage";
import Skeleton from "../components/ui/Skeleton";
import RaffleHelmet from "../components/raffle/RaffleHelmet";
import RaffleNavHeader from "../components/raffle/RaffleNavHeader";
import RaffleHeroSection from "../components/raffle/RaffleHeroSection";
import RaffleMetadataSection from "../components/raffle/RaffleMetadataSection";
import RaffleParticipantsSection from "../components/raffle/RaffleParticipantsSection";
import RafflePurchaseSection from "../components/raffle/RafflePurchaseSection";
import RaffleFairnessSection from "../components/raffle/RaffleFairnessSection";
import RaffleNotificationSection from "../components/raffle/RaffleNotificationSection";
import type { RecentParticipantsHandle } from "../components/RecentParticipants";

const RafflePage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { address } = useAuth();
    const recentParticipantsRef = useRef<RecentParticipantsHandle>(null);

    const raffleId = id ? parseInt(id) : 0;
    const { raffle, isLoading, error } = useRaffle(raffleId);

    const handleTicketPurchase = (ticketCount: number) => {
        if (address && recentParticipantsRef.current) {
            recentParticipantsRef.current.addOptimisticParticipant(address);
        }
        console.log("Buying tickets:", ticketCount);
    };

    if (isLoading) {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-6 w-32" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <Skeleton className="w-full aspect-video rounded-3xl" />
                        <Skeleton className="h-10 w-3/4" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                    <div className="space-y-6">
                        <Skeleton className="h-64 w-full rounded-3xl" />
                        <Skeleton className="h-32 w-full rounded-3xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (error || !raffle) {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-20 flex flex-col items-center">
                <ErrorMessage
                    title={error ? t("raffle.errorLoading") : t("raffle.notFound")}
                    message={error?.message || t("raffle.notFoundMessage")}
                />
                <button
                    onClick={() => navigate("/home")}
                    className="mt-8 px-8 py-3 rounded-xl bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 transition-colors flex items-center space-x-2"
                >
                    <span>{t("raffle.backToHome")}</span>
                </button>
            </div>
        );
    }

    const title = raffle.metadata?.title || raffle.description;

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <RaffleHelmet title={title} description={raffle.description} image={raffle.image} />
            <Breadcrumbs
                items={[
                    { label: t("navbar.discover"), href: "/home" },
                    { label: t("home.seeAll"), href: "/search" },
                    { label: raffle.description || t("raffle.back") },
                ]}
            />
            <RaffleNavHeader onBack={() => navigate(-1)} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-2 space-y-8">
                    <RaffleHeroSection
                        image={raffle.image}
                        title={title}
                        isActive={raffle.isActive}
                        isFinalized={raffle.isFinalized}
                    />
                    <RaffleMetadataSection raffle={raffle} />
                    <RaffleParticipantsSection
                        ref={recentParticipantsRef}
                        raffleId={raffleId}
                        currentUserAddress={address}
                    />
                </div>

                <div className="space-y-6 sticky top-8">
                    <RafflePurchaseSection
                        ticketPrice={raffle.ticketPrice}
                        ticketPriceFormatted={raffle.ticketPriceFormatted}
                        prizeCurrency={raffle.prizeCurrency}
                        entries={raffle.entries}
                        maxTickets={raffle.maxTickets}
                        progress={raffle.progress}
                        endTime={raffle.endTime}
                        isActive={raffle.isActive}
                        isFinalized={raffle.isFinalized}
                        winner={raffle.winner}
                        title={title}
                        onPurchase={handleTicketPurchase}
                    />
                    <RaffleFairnessSection />
                    <RaffleNotificationSection raffleId={raffleId} />
                </div>
            </div>
        </div>
    );
};

export default RafflePage;
