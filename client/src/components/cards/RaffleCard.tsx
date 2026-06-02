import React from "react";
import { Link } from "react-router-dom";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";
import EnterRaffleButton from "../EnterRaffleButton";
import LazyImage from "../LazyImage";

// ── Status badge ──────────────────────────────────────────────────────────────

type RaffleCardProps = {
    image: string;
    title: string;
    prizeValue: string;
    prizeCurrency?: string; // default "ETH"
    countdown: Countdown;
    ticketPrice: string;
    /** Asset symbol displayed next to ticket price, e.g. "XLM", "USDC" */
    ticketAsset?: string;
    entries: number;
    progress: number; // 0–100
    buttonText?: string;
    onEnter?: () => void; // optional click handler
    raffleId?: number; // Contract raffle ID
    /** Optional telemetry callback for image errors */
    onImageError?: (src: string) => void;
};

const RaffleCard: React.FC<RaffleCardProps> = ({
    image,
    title,
    prizeValue,
    prizeCurrency = "ETH",
    countdown,
    ticketPrice,
    ticketAsset = "XLM",
    entries,
    progress,
    buttonText = "Enter Raffle",
    onEnter,
    raffleId,
    onImageError,
}) => {
    return (
        <div className="w-full bg-white dark:bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4">
            {/* Clickable content area - links to details page */}
            {raffleId ? (
                <Link
                    to={`/raffles/${raffleId}`}
                    className="flex flex-col space-y-4 cursor-pointer hover:opacity-90 transition-opacity"
                >
                    {/* Image */}
                    <div className="w-full">
                        <LazyImage
                            src={image}
                            alt={title}
                            aspectRatio={16/9}
                            containerClassName="w-full rounded-3xl"
                            className="w-full h-full object-cover"
                            onError={onImageError}
                        />
                    </div>

                {/* Title & Prize */}
                <div>
                    <p className="text-[22px] font-bold">{title}</p>
                    <p className="text-gray-600 dark:text-[#9CA3AF] text-sm">
                        Prize Value:{" "}
                        <span className="font-bold text-yellow-600 dark:text-[#FFD700]">
                            {prizeValue} {prizeCurrency}
                        </span>
                    </p>
                </div>

                {/* Countdown (active) or winner / status info (inactive) */}
                {isActive ? (
                    <div>
                        <Line />
                        <p className="text-xs text-center text-gray-600 dark:text-[#9CA3AF]">
                            Ends In
                        </p>
                        <div className="flex justify-center space-x-1">
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
                        <Line />
                    </div>
                ) : status === "finalized" ? (
                    <div>
                        <Line />
                        <p className="text-xs text-center text-gray-600 dark:text-[#9CA3AF]">
                            Winner
                        </p>
                        {winner ? (
                            <p
                                className="text-center text-xs text-blue-400 font-mono truncate px-2"
                                data-testid="winner-address"
                            >
                                {winner.slice(0, 6)}…{winner.slice(-6)}
                            </p>
                        ) : (
                            <p className="text-center text-xs text-gray-500">
                                Awaiting result
                            </p>
                            <p data-testid="entries-count">{entries}</p>
                        </div>
                    </div>

                    {/* Progress */}
                    <ProgressBar value={progress} />
                </Link>
            ) : (
                <div className="flex flex-col space-y-4">
                    {/* Image */}
                    <div className="w-full">
                        <LazyImage
                            src={image}
                            alt={title}
                            aspectRatio={16/9}
                            containerClassName="w-full rounded-3xl"
                            className="w-full h-full object-cover"
                            onError={onImageError}
                        />
                    </div>
                ) : (
                    /* cancelled — just a divider */
                    <Line />
                )}

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
                        <p data-testid="entries-count">{entries}</p>
                    </div>
                </div>

                {/* Progress */}
                <ProgressBar value={progress} />
            </Link>

            {/* CTA — outside the Link to prevent navigation on button click */}
            {isActive ? (
                <EnterRaffleButton
                    raffleId={raffleId}
                    ticketPrice={ticketPrice}
                    onSuccess={() => {
                        onEnter?.();
                    }}
                    onError={(error) => {
                        console.error("Error purchasing ticket:", error);
                        alert(error);
                    }}
                >
                    {buttonText}
                </EnterRaffleButton>
            ) : (
                <button
                    disabled
                    className="border border-gray-500 dark:border-gray-600 px-8 py-4 rounded-xl opacity-50 cursor-not-allowed"
                    data-testid="status-button"
                >
                    {buttonText}
                </button>
            )}
        </div>
    );
};

export default RaffleCard;
