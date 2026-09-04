import { logger } from '../utils/logger';
import { useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import { useRafflePageData } from "../hooks/useRafflePageData";
import { ProgressBar } from "../components/ui/ProgressBar";
import ErrorMessage from "../components/ui/ErrorMessage";
import VerifiedBadge from "../components/VerifiedBadge";
import RecentParticipants, { type RecentParticipantsHandle } from "../components/RecentParticipants";
import { ArrowLeft, Share2 } from "lucide-react";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { useTranslation } from "react-i18next";
import type { FormattedRaffle } from "../types/types";
import RaffleSeo from "../components/raffle/RaffleSeo";
import RaffleHero from "../components/raffle/RaffleHero";
import RaffleInfo from "../components/raffle/RaffleInfo";
import RaffleSidebar from "../components/raffle/RaffleSidebar";

const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`} />
);

const RafflePage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { address } = useAuth();
    const [ticketCount, setTicketCount] = useState(1);
    const recentParticipantsRef = useRef<RecentParticipantsHandle>(null);

    const raffleId = id ? parseInt(id) : 0;
    const { data, purchaseTickets } = useRafflePageData(raffleId);

    const handleTicketPurchase = () => {
        // Only purchasable once the raffle data has loaded
        if (data.status !== "ready") return;
        // Add optimistic update for current user
        if (address && recentParticipantsRef.current) {
            recentParticipantsRef.current.addOptimisticParticipant(address);
        }
        // A successful purchase invalidates the raffle detail/list + user profile keys
        purchaseTickets.mutate({
            raffleId,
            ticketCount,
            maxPricePerTicket: data.raffle.ticketPrice,
        });
    };

    if (data.status === "loading") {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-6 w-32" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <Skeleton className="w-full aspect-video rounded-3xl" />
                        <div className="space-y-4">
                            <Skeleton className="h-10 w-3/4" />
                            <Skeleton className="h-24 w-full" />
                        </div>
                    </div>
                    <div className="space-y-6">
                        <Skeleton className="h-64 w-full rounded-3xl" />
                        <Skeleton className="h-32 w-full rounded-3xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (data.status === "error") {
        return (
            <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-20 flex flex-col items-center">
                <ErrorMessage
                    title={t("raffle.errorLoading")}
                    message={data.error.message || t("raffle.notFoundMessage")}
                />
                <button
                    onClick={() => navigate("/home")}
                    className="mt-8 px-8 py-3 rounded-xl bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 transition-colors flex items-center space-x-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t("raffle.backToHome")}</span>
                </button>
            </div>
        );
    }

    const raffle = data.raffle;

    const {
        description,
        image,
        ticketPriceFormatted,

        prizeCurrency,
        progress,
        entries,
        maxTickets,
        creator,
        isActive,
        isFinalized,
        winner,
        metadata,
        ticketPrice,
        endTime,
    } = raffle as FormattedRaffle;

    const title = metadata?.title || description;

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <RaffleSeo title={title} description={description} image={image} />

            <Breadcrumbs
                items={[
                    { label: t("navbar.discover"), href: "/home" },
                    { label: t("home.seeAll"), href: "/search" },
                    { label: description || t("raffle.back") }
                ]}
            />

            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center space-x-2 text-gray-400 hover:text-gray-900 dark:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">{t("raffle.back")}</span>
                </button>
                <div className="flex items-center space-x-3">
                    <button className="p-2 rounded-xl bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 transition-colors text-gray-400 hover:text-gray-900 dark:text-white">
                        <Share2 className="w-5 h-5" />
                    </button>
                    <VerifiedBadge />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-2 space-y-8">
                    <RaffleHero image={image} title={title} isActive={isActive} isFinalized={isFinalized} />
                    <RaffleInfo
                        title={title}
                        description={description}
                        creator={creator}
                        prizeCurrency={prizeCurrency}
                    />
                    <div className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/5 rounded-3xl p-8">
                        <RecentParticipants
                            raffleId={raffleId}
                            currentUserAddress={address}
                            ref={recentParticipantsRef}
                        />
                    </div>
                </div>

                <RaffleSidebar
                    raffleId={raffleId}
                    title={title}
                    ticketPrice={ticketPrice}
                    ticketPriceFormatted={ticketPriceFormatted}
                    prizeCurrency={prizeCurrency}
                    progress={progress}
                    entries={entries}
                    maxTickets={maxTickets}
                    endTime={endTime}
                    isActive={isActive}
                    isFinalized={isFinalized}
                    winner={winner}
                    ticketCount={ticketCount}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onTicketPurchase={handleTicketPurchase}
                />
            </div>
        </div>
    );
};

export default RafflePage;
