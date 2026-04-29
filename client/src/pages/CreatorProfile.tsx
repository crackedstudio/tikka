import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useUserProfile, useRaffles } from "../hooks/useRaffles";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import RaffleCard from "../components/cards/RaffleCard";
import { mapListItemToCardProps } from "../services/raffleService";
import ErrorMessage from "../components/ui/ErrorMessage";
import { Spinner } from "../components/ui/Spinner";

const CreatorProfile: React.FC = () => {
    const { address } = useParams<{ address: string }>();
    const [isFollowed, setIsFollowed] = useState(false);

    const { profile, isLoading: profileLoading, error: profileError } = useUserProfile(address || null);
    
    // Paginated raffles by this creator
    const [page, setPage] = useState(0);
    const LIMIT = 12;
    const { raffles, total, isLoading: rafflesLoading, error: rafflesError } = useRaffles({
        creator: address,
        limit: LIMIT,
        offset: page * LIMIT
    });

    useEffect(() => {
        if (address) {
            const followed = JSON.parse(localStorage.getItem("followed_creators") || "[]");
            setIsFollowed(followed.includes(address));
        }
    }, [address]);

    const toggleFollow = () => {
        if (!address) return;
        const followed = JSON.parse(localStorage.getItem("followed_creators") || "[]");
        let newFollowed;
        if (isFollowed) {
            newFollowed = followed.filter((a: string) => a !== address);
        } else {
            newFollowed = [...followed, address];
        }
        localStorage.setItem("followed_creators", JSON.stringify(newFollowed));
        setIsFollowed(!isFollowed);
    };

    if (profileLoading && page === 0) return <div className="flex justify-center py-20"><Spinner /></div>;
    if (profileError) return <ErrorMessage message="Failed to load creator profile" />;
    if (!profile) return <ErrorMessage message="Creator not found" />;

    const stats = profile.creator_stats || {
        raffles_created: 0,
        total_tickets_sold: 0,
        total_xlm_raised: "0",
        participant_win_rate: 0
    };

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0B0F1A] text-gray-900 dark:text-white">
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                <div className="mb-6">
                    <Breadcrumbs />
                </div>

                {/* Header / Profile Info */}
                <div className="bg-white dark:bg-[#11172E] rounded-3xl p-8 mb-8 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-[#FF389C] to-[#8A3FFC] rounded-2xl flex items-center justify-center text-3xl font-bold text-white">
                                {address?.substring(0, 2)}
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold mb-1">
                                    {address?.substring(0, 6)}...{address?.substring(address.length - 6)}
                                </h1>
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-mono break-all">
                                    {address}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={toggleFollow}
                            className={`px-8 py-3 rounded-xl font-medium transition-all ${
                                isFollowed
                                    ? "bg-gray-200 dark:bg-[#1E2540] text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-[#2A3355]"
                                    : "bg-[#FF389C] hover:bg-[#FF389C]/90 text-white shadow-lg shadow-[#FF389C]/20"
                            }`}
                        >
                            {isFollowed ? "Following" : "Follow Creator"}
                        </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 pt-10 border-t border-gray-100 dark:border-[#1E2540]">
                        <div className="text-center">
                            <p className="text-3xl font-bold text-[#FF389C]">{stats.raffles_created}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Raffles Created</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-blue-500">{stats.total_tickets_sold}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Tickets Sold</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-green-500">{parseFloat(stats.total_xlm_raised).toFixed(2)}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">XLM Raised</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-yellow-500">{stats.participant_win_rate}%</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Participant Win Rate</p>
                        </div>
                    </div>
                </div>

                {/* Raffles Grid */}
                <div className="mb-12">
                    <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                        Raffles by this Creator
                        <span className="text-sm font-normal text-gray-500 bg-gray-100 dark:bg-[#1E2540] px-3 py-1 rounded-full">
                            {total}
                        </span>
                    </h2>

                    {rafflesLoading && page === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[1, 2, 3, 4].map((n) => (
                                <div key={n} className="h-[450px] bg-white dark:bg-[#11172E] rounded-3xl animate-pulse" />
                            ))}
                        </div>
                    ) : rafflesError ? (
                        <ErrorMessage message="Failed to load raffles" />
                    ) : raffles.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-[#11172E] rounded-3xl">
                            <p className="text-gray-500 dark:text-gray-400">This creator hasn't published any raffles yet.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {raffles.map((raffle) => (
                                    <RaffleCard
                                        key={raffle.id}
                                        {...mapListItemToCardProps(raffle)}
                                    />
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-4 mt-12">
                                    <button
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                        className="px-6 py-3 rounded-xl font-medium bg-white dark:bg-[#11172E] text-gray-700 dark:text-white disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#1E2540] transition-colors shadow-sm"
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-sm font-medium">
                                        Page {page + 1} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={page >= totalPages - 1}
                                        className="px-6 py-3 rounded-xl font-medium bg-white dark:bg-[#11172E] text-gray-700 dark:text-white disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-[#1E2540] transition-colors shadow-sm"
                                    >
                                        Next →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreatorProfile;
