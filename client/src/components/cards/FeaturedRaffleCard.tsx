import React from "react";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";
import AddToCalendar from "../ui/AddToCalendar";
import type { RaffleCardViewModel, RaffleStatus } from "./raffleCardViewModel";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_PILL_CLASS: Record<RaffleStatus, string> = {
    live: "bg-green-500/20 text-green-400 border border-green-500/30",
    "ending-soon": "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    finalized: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    cancelled: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface FeaturedRaffleCardProps {
    viewModel: RaffleCardViewModel;
    onEnter?: () => void;
}

const FeaturedRaffleCard: React.FC<FeaturedRaffleCardProps> = ({
    viewModel,
    onEnter,
}) => {
    const {
        title,
        description,
        imageUrl,
        status,
        statusLabel,
        prizeValue,
        prizeCurrency,
        countdown,
        endTimeUnix,
        ticketPrice,
        entries,
        progress,
        buttonText,
    } = viewModel;

    const isActive = status === "live" || status === "ending-soon";

    return (
        <div className="w-full bg-white dark:bg-[#11172E] p-4 md:p-6 lg:p-8 rounded-3xl border border-gray-200 dark:border-[#1F263F] my-5">
            <div className="flex flex-col gap-6 md:flex-row md:gap-8 items-stretch">
                {/* Image (stacks on top for mobile) */}
                <div className="relative w-full md:w-1/2">
                    <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-auto rounded-2xl object-cover"
                    />
                    <span
                        className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL_CLASS[status]}`}
                        data-testid="status-badge"
                    >
                        {statusLabel}
                    </span>
                </div>

                {/* Content */}
                <div className="w-full md:w-1/2 flex flex-col space-y-6">
                    {/* Title & Description */}
                    <div>
                        <p className="text-2xl md:text-3xl font-bold">{title}</p>
                        <p className="text-sm md:text-base text-gray-600 dark:text-[#9CA3AF] mt-3">
                            {description}
                        </p>
                    </div>

                    <Line />

                    {/* Prize + Countdown / Status */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-gray-600 dark:text-[#9CA3AF] text-sm">
                                Prize Value:
                            </p>
                            <p className="font-bold text-yellow-600 dark:text-[#FFD700] text-xl md:text-2xl">
                                {prizeValue} {prizeCurrency}
                            </p>
                        </div>

                        {isActive ? (
                            <div className="sm:text-right">
                                <p className="text-xs text-gray-600 dark:text-[#9CA3AF] mb-2">
                                    Ends In
                                </p>
                                <div className="flex justify-start sm:justify-end gap-1">
                                    <span className="bg-[#242B46] rounded px-2 py-1">
                                        {countdown.days}d
                                    </span>
                                    <span className="bg-[#242B46] rounded px-2 py-1">
                                        {countdown.hours}h
                                    </span>
                                    <span className="bg-[#242B46] rounded px-2 py-1">
                                        {countdown.minutes}m
                                    </span>
                                    <span className="bg-[#242B46] rounded px-2 py-1">
                                        {countdown.seconds}s
                                    </span>
                                </div>
                                {endTimeUnix > 0 && (
                                    <div className="mt-2 flex justify-start sm:justify-end">
                                        <AddToCalendar
                                            title={title}
                                            endTimeUnix={endTimeUnix}
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="sm:text-right">
                                <span
                                    className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_PILL_CLASS[status]}`}
                                >
                                    {statusLabel}
                                </span>
                            </div>
                        )}
                    </div>

                    <Line />

                    {/* Ticket & Entries */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                                Ticket price
                            </p>
                            <p className="text-sm md:text-base">{ticketPrice}</p>
                        </div>
                        <div>
                            <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">
                                Entries
                            </p>
                            <p className="text-sm md:text-base">{entries}</p>
                        </div>
                    </div>

                    {/* Progress */}
                    <ProgressBar value={progress} />

                    {/* CTA */}
                    <button
                        onClick={isActive ? onEnter : undefined}
                        disabled={!isActive}
                        className={`w-full self-stretch md:self-start px-8 py-4 rounded-xl text-gray-900 dark:text-white font-medium transition ${
                            isActive
                                ? ""
                                : "opacity-50 cursor-not-allowed"
                        }`}
                        style={
                            isActive
                                ? {
                                      background:
                                          "linear-gradient(100.92deg, #A259FF 13.57%, #FF6250 97.65%)",
                                  }
                                : undefined
                        }
                    >
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FeaturedRaffleCard;
