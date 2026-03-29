import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useRaffle } from "../hooks/useRaffles";
import { ProgressBar } from "../components/ui/ProgressBar";
import ErrorMessage from "../components/ui/ErrorMessage";
import VerifiedBadge from "../components/VerifiedBadge";
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
    ExternalLink
} from "lucide-react";
import Line from "../assets/svg/Line";
import detailimage from "../assets/detailimage.png";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`} />
);

const RafflePage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [ticketCount, setTicketCount] = useState(1);

    const raffleId = id ? parseInt(id) : 0;
    const { raffle, isLoading, error, refetch } = useRaffle(raffleId);

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
                    title={error ? "Error Loading Raffle" : "Raffle Not Found"}
                    message={error?.message || "The raffle you're looking for doesn't exist or has been removed."}
                />
                <button
                    onClick={() => navigate("/home")}
                    className="mt-8 px-8 py-3 rounded-xl bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 transition-colors flex items-center space-x-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Home</span>
                </button>
            </div>
        );
    }

    const {
        title,
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
        winner
    } = raffle;

    const handleIncrement = () => setTicketCount(prev => Math.min(prev + 1, maxTickets - entries));
    const handleDecrement = () => setTicketCount(prev => Math.max(prev - 1, 1));

    const totalCost = (parseFloat(raffle.ticketPrice) * ticketCount).toFixed(3);

    return (
        <div className="w-full mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-8 flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Breadcrumbs
                items={[
                    { label: 'Home', href: '/home' },
                    { label: 'Explore', href: '/search' },
                    { label: description || 'Raffle Details' }
                ]}
            />

            {/* Navigation Header */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center space-x-2 text-gray-400 hover:text-gray-900 dark:text-white transition-colors group"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">Back</span>
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
                                    <span className="text-xs font-bold uppercase tracking-wider">Live Now</span>
                                </div>
                            ) : isFinalized ? (
                                <div className="flex items-center space-x-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-md shadow-lg">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Finalized</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 bg-gray-500/20 text-gray-400 px-4 py-1.5 rounded-full border border-gray-500/30 backdrop-blur-md shadow-lg">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Ended</span>
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
                                <span className="text-sm">Created by <span className="text-gray-900 dark:text-white font-medium">{creator.slice(0, 6)}...{creator.slice(-4)}</span></span>
                                <ExternalLink className="w-3 h-3 hover:text-gray-900 dark:text-white cursor-pointer" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                                <Info className="w-5 h-5 text-pink-600 dark:text-[#FE3796]" />
                                <h3 className="text-lg font-bold">About this raffle</h3>
                            </div>
                            <p className="text-gray-400 leading-relaxed">
                                {description || "No description provided by the creator."}
                            </p>
                        </div>

                        <Line />

                        {/* Additional Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Prize</p>
                                <p className="text-xl font-black text-yellow-600 dark:text-[#FFD700]">{prizeValue} {prizeCurrency}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Started</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    <span>Mar 2026</span>
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Network</p>
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
                            <p className="text-sm text-gray-400 font-medium">Ticket Price</p>
                            <p className="text-3xl font-black text-gray-900 dark:text-white">{ticketPriceFormatted}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center space-x-2 text-gray-400">
                                    <Ticket className="w-4 h-4" />
                                    <span>Progress</span>
                                </div>
                                <span className="font-bold text-gray-900 dark:text-white">{entries} / {maxTickets} sold</span>
                            </div>
                            <ProgressBar value={progress} height="8px" />
                        </div>

                        <div className="p-4 bg-gray-200 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">Ends In</span>
                                <div className="flex space-x-2 font-mono text-sm">
                                    <span className="bg-gray-300 dark:bg-white/10 px-2 py-0.5 rounded text-gray-900 dark:text-white">{countdown.days}d</span>
                                    <span className="bg-gray-300 dark:bg-white/10 px-2 py-0.5 rounded text-gray-900 dark:text-white">{countdown.hours}h</span>
                                    <span className="bg-gray-300 dark:bg-white/10 px-2 py-0.5 rounded text-gray-900 dark:text-white">{countdown.minutes}m</span>
                                </div>
                            </div>
                            <Line />
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-400">Total Participants</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-1">
                                    <Users className="w-4 h-4 text-pink-600 dark:text-[#FE3796]" />
                                    <span>{entries > 10 ? entries - 3 : entries} unique</span>
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
                                    BUY FOR {totalCost} {prizeCurrency}
                                </button>
                                <p className="text-[10px] text-center text-gray-500 uppercase tracking-widest font-bold">Secure checkout via Stellar Toolkit</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {isFinalized && winner ? (
                                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center space-y-2">
                                        <Trophy className="w-8 h-8 text-yellow-500 mx-auto" />
                                        <p className="text-xs text-yellow-500/80 font-bold uppercase">Raffle Winner</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-white truncate px-2">{winner}</p>
                                        <button className="text-xs text-yellow-500 hover:underline">View Proof</button>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-2xl text-center">
                                        <p className="text-sm font-bold text-gray-400">Raffle Ended</p>
                                        <p className="text-xs text-gray-500">No winner announced yet</p>
                                    </div>
                                )}
                                <button
                                    disabled
                                    className="w-full py-4 rounded-xl bg-gray-600/20 text-gray-500 font-bold border border-gray-200 dark:border-white/5 cursor-not-allowed uppercase tracking-widest text-sm"
                                >
                                    Participation Closed
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
                            <p className="text-sm font-bold text-gray-900 dark:text-white">Provably Fair</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Winner selection uses Soroban VRF for ultimate transparency and fairness.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RafflePage;
