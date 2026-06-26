import React from "react";
import { Link } from "react-router-dom";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";
import type { RaffleCardViewModel, RaffleStatus } from "./raffleCardViewModel";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_PILL_CLASS: Record<RaffleStatus, string> = {
    live: "bg-green-500/20 text-green-400 border border-green-500/30",
    "ending-soon": "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    finalized: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    cancelled: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface RecentlyAddedCardProps {
    viewModel: RaffleCardViewModel;
}

const RecentlyAddedCard: React.FC<RecentlyAddedCardProps> = ({ viewModel }) => {
    const {
        raffleId,
        title,
        imageUrl,
        status,
        statusLabel,
        countdown,
        ticketPrice,
        entries,
        progress,
    } = viewModel;

    const isActive = status === "live" || status === "ending-soon";

    return (
        <Link
            to={`/raffles/${raffleId}`}
            className="w-full bg-white dark:bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4 hover:opacity-90 transition-opacity"
        >
            {/* Image + status badge */}
            <div className="relative w-full">
                <img
                    src={imageUrl}
                    alt="Raffle"
                    className="w-full object-cover rounded-3xl"
                />
                <span
                    className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL_CLASS[status]}`}
                    data-testid="status-badge"
                >
                    {statusLabel}
                </span>
            </div>

            {/* Title + Countdown */}
            <div className="flex flex-col space-y-2">
                <p className="text-[14px] font-bold">{title}</p>

                {isActive ? (
                    <div className="flex space-x-2">
                        <span className="bg-[#242B46] rounded p-1">
                            {countdown.days}d
                        </span>
                        <span className="bg-[#242B46] rounded p-1">
                            {countdown.hours}h
                        </span>
                        <span className="bg-[#242B46] rounded p-1">
                            {countdown.minutes}m
                        </span>
                        <span className="bg-[#242B46] rounded p-1">
                            {countdown.seconds}s
                        </span>
                    </div>
                ) : (
                    <span
                        className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL_CLASS[status]}`}
                    >
                        {statusLabel}
                    </span>
                )}

                <Line />
            </div>

            {/* Ticket & Entries */}
            <div className="flex justify-between">
                <div>
                    <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                        Ticket price
                    </p>
                    <p>{ticketPrice}</p>
                </div>
                <div>
                    <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                        Entries
                    </p>
                    <p>{entries}</p>
                </div>
            </div>

            {/* Progress */}
            <ProgressBar value={progress} />
        </Link>
    );
};

export default RecentlyAddedCard;
