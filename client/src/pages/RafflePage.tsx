import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useRaffle } from "../hooks/useRaffles";
import { ProgressBar } from "../components/ui/ProgressBar";
import ErrorMessage from "../components/ui/ErrorMessage";
import VerifiedBadge from "../components/VerifiedBadge";
import NotificationSubscribeButton from "../components/NotificationSubscribeButton";
import {
    Ticket,
    Users,
    Clock,
    ShieldCheck,
    ArrowLeft,
    Share2,
    Info,
    Trophy,
    User,
    Wallet,
    Calendar,
    ExternalLink,
    Bell
} from "lucide-react";
import AddToCalendar from "../components/ui/AddToCalendar";
import Line from "../assets/svg/Line";
import detailimage from "../assets/detailimage.png";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { CountdownTimer } from "../components/ui/CountdownTimer";

const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`} />
);

const RafflePage = () => {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [ticketCount, setTicketCount] = useState(1);

    const raffleId = id ? parseInt(id) : 0;
    const { raffle, isLoading, error } = useRaffle(raffleId);

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
                    <ArrowLeft className="w-4 h-4" />
                    <span>{t("raffle.backToHome")}</span>
                </button>
            </div>
        );
    }

    const {
        description,
        image,
        ticketPriceFormatted,
        prizeValue,
        prizeCurrency,
        countdown,
        progress,
        entries,
        maxTickets,
        creator,
        isActive,
        isFinalized,
        winner,
        metadata
    } = raffle;
    
    const title = metadata?.title || description;

    const handleIncrement = () => setTicketCount(prev => Math.min(prev + 1, maxTickets - entries));
    const handleDecrement = () => setTicketCount(prev => Math.max(prev - 1, 1));

    const totalCost = (parseFloat(raffle.ticketPrice) * ticketCount).toFixed(3);

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Helmet>
                <title>{title} | Tikka Raffles</title>
                <meta name="description" content={description || "Join this raffle on Tikka — Decentralized Raffles on Stellar."} />
                
                {/* Open Graph */}
                <meta property="og:title" content={`${title} | Tikka Raffles`} />
                <meta property="og:description" content={description || "Join this raffle on Tikka — Decentralized Raffles on Stellar."} />
                <meta property="og:image" content={image || `${window.location.origin}/og-image.png`} />
                <meta property="og:url" content={window.location.href} />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Tikka" />
                
                {/* Twitter Card */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={`${title} | Tikka Raffles`} />
                <meta name="twitter:description" content={description || "Join this raffle on Tikka — Decentralized Raffles on Stellar."} />
                <meta name="twitter:image" content={image || `${window.location.origin}/og-image.png`} />
                <meta name="twitter:site" content="@tikaborofficial" />
                <meta name="twitter:creator" content="@tikaborofficial" />
            </Helmet>
            <Breadcrumbs
                items={[
                    { label: t("navbar.discover"), href: "/home" },
                    { label: t("home.seeAll"), href: "/search" },
                    { label: description || t("raffle.back") }
                ]}
            />

            {/* Navigation Header */}
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
                {/* Left Column: Image & Details */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Hero Section */}
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl z-10" />
                        <img
                            src={image || detailimage}
                            alt={title}
                            className="w-full aspect-video md:aspect-auto md:max-h-[500px] object-cover rounded-3xl shadow-2xl border border-gray-200 dark:border-white/5"
                        />
                        {/* Status Badge Over Image */}
                        <div className="absolute top-6 left-6 z-20">
                            {isActive ? (
                                <div className="flex items-center space-x-2 bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full border border-green-500/30 backdrop-blur-md shadow-lg">
                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                    <span className="text-xs font-bold uppercase tracking-wider">{t("raffle.liveNow")}</span>
                                </div>
                            ) : isFinalized ? (
                                <div className="flex items-center space-x-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-md shadow-lg">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold uppercase tracking-wider">{t("raffle.finalized")}</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 bg-gray-500/20 text-gray-400 px-4 py-1.5 rounded-full border border-gray-500/30 backdrop-blur-md shadow-lg">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold uppercase tracking-wider">{t("raffle.ended")}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/5 rounded-3xl p-8 space-y-6">
                        <div className="space-y-2">
                            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 dark:text-white">{title}</h1>
                            <div className="flex items-center space-x-3 text-gray-400">
                                <User className="w-4 h-4" />
                                <span className="text-sm">{t("raffle.createdBy")} <span className="text-gray-900 dark:text-white font-medium">{creator.slice(0, 6)}...{creator.slice(-4)}</span></span>
                                <ExternalLink className="w-3 h-3 hover:text-gray-900 dark:text-white cursor-pointer" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                                <Info className="w-5 h-5 text-pink-600 dark:text-[#FE3796]" />
                                <h3 className="text-lg font-bold">{t("raffle.about")}</h3>
                            </div>
                            <p className="text-gray-400 leading-relaxed">
                                {description || t("raffle.noDescription")}
                            </p>
                        </div>

                        <Line />

                        {/* Additional Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                             <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.prize")}</p>
                                <p className="text-xl font-black text-yellow-600 dark:text-[#FFD700]">{prizeValue} {prizeCurrency}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.started")}</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span>Mar 2026</span>
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.network")}</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                                    <Wallet className="w-4 h-4 text-gray-400" />
                                    <span>Soroban</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: CTA Sidebar */}
                <div className="space-y-6 sticky top-8">
                    {/* Main Action Card */}
                    <div className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6">
                        <div className="space-y-1">
                            <p className="text-sm text-gray-400 font-medium">{t("raffle.ticketPrice")}</p>
                            <p className="text-3xl font-black text-gray-900 dark:text-white">{ticketPriceFormatted}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center space-x-2 text-gray-400">
                                    <Ticket className="w-4 h-4" />
                                    <span>{t("raffle.progress")}</span>
                                </div>
                                <span className="font-bold text-gray-900 dark:text-white">{entries} / {maxTickets} {t("raffle.sold")}</span>
                            </div>
                            <ProgressBar value={progress} height="8px" />
                        </div>

                        <div className="p-4 bg-gray-200 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/5 space-y-4">
                             <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">{t("raffle.endsIn")}</span>
                                <CountdownTimer endTime={raffle.endTime} />
                            </div>
                            {isActive && (
                                <AddToCalendar
                                    title={title}
                                    endTimeUnix={raffle.endTime}
                                />
                            )}
                            <Line />
                             <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">{t("raffle.totalParticipants")}</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-1">
                                    <Users className="w-4 h-4 text-pink-600 dark:text-[#FE3796]" />
                                    <span>{entries > 10 ? entries - 3 : entries} {t("raffle.unique")}</span>
                                </span>
                            </div>
                        </div>

                        {isActive ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-black/20 p-1.5 rounded-xl border border-gray-200 dark:border-white/5">
                                    <button 
                                        onClick={handleDecrement}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 text-gray-900 dark:text-white transition-colors"
                                    >
                                        -
                                    </button>
                                    <span className="text-xl font-bold">{ticketCount}</span>
                                    <button
                                        onClick={handleIncrement}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#FE3796] hover:brightness-110 text-gray-900 dark:text-white transition-colors"
                                    >
                                        +
                                    </button>
                                </div>

                                <button 
                                    className="w-full py-4 rounded-xl font-black text-gray-900 dark:text-white tracking-wider shadow-lg shadow-[#FE3796]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                     style={{
                                        background: "linear-gradient(100.92deg, #FE3796 13.57%, #3931F9 97.65%)"
                                    }}
                                    onClick={() => console.log("Buying tickets:", ticketCount)}
                                >
                                    {t("raffle.buyFor", { cost: totalCost, currency: prizeCurrency })}
                                </button>
                                <p className="text-[10px] text-center text-gray-500 uppercase tracking-widest font-bold">{t("raffle.secureCheckout")}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {isFinalized && winner ? (
                                     <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center space-y-2">
                                        <Trophy className="w-8 h-8 text-yellow-500 mx-auto" />
                                        <p className="text-xs text-yellow-500/80 font-bold uppercase">{t("raffle.winner")}</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-white truncate px-2">{winner}</p>
                                        <button className="text-xs text-yellow-500 hover:underline">{t("raffle.viewProof")}</button>
                                    </div>
                                 ) : (
                                    <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-2xl text-center">
                                        <p className="text-sm font-bold text-gray-400">{t("raffle.ended")}</p>
                                        <p className="text-xs text-gray-500">{t("raffle.noWinnerYet")}</p>
                                    </div>
                                )}
                                 <button
                                    disabled
                                    className="w-full py-4 rounded-xl bg-gray-600/20 text-gray-500 font-bold border border-gray-200 dark:border-white/5 cursor-not-allowed uppercase tracking-widest text-sm"
                                >
                                    {t("raffle.participationClosed")}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Quick Help Card */}
                    <div className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 flex items-start space-x-4">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <ShieldCheck className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{t("raffle.provablyFair")}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{t("raffle.fairnessDetail")}</p>
                        </div>
                    </div>

                    {/* Notification Subscription Card */}
                    <div className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 space-y-4">
                        <div className="flex items-center space-x-3">
                            <div className="bg-purple-500/20 p-2 rounded-lg">
                                <Bell className="w-5 h-5 text-purple-400" />
                            </div>
                             <div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{t("raffle.stayUpdated")}</p>
                                <p className="text-xs text-gray-500">{t("raffle.getNotified")}</p>
                            </div>
                        </div>
                        <NotificationSubscribeButton
                            raffleId={raffleId}
                            onAuthRequired={() =>
                                toast.info('Sign in required', {
                                    description: 'Connect your wallet and sign in to subscribe to notifications.',
                                })
                            }
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RafflePage;
