import React from "react";
import { Link } from "react-router-dom";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";
import EnterRaffleButton from "../EnterRaffleButton";
import LazyImage from "../LazyImage";
import type { RaffleCardViewModel } from "./raffleCardViewModel";

type RaffleCardProps = {
    viewModel: RaffleCardViewModel;
    onEnter?: () => void;
};

const RaffleCard: React.FC<RaffleCardProps> = ({ viewModel, onEnter }) => {
    const {
        raffleId,
        title,
        imageUrl,
        prizeValue,
        prizeCurrency = "ETH",
        countdown,
        ticketPrice,
        ticketAsset = "XLM",
        entries,
        progress,
        buttonText = "Enter Raffle",
        status,
        winner,
    } = viewModel;

    const isActive = status === "live" || status === "ending-soon";

    const statusSection = isActive ? (
        <div>
            <Line />
            <p className="text-xs text-center text-gray-600 dark:text-[#9CA3AF]">Ends In</p>
            <div className="flex justify-center space-x-1">
                <span className="bg-[#242B46] rounded p-1">{countdown.days}d</span>
                <span className="bg-[#242B46] rounded p-1">{countdown.hours}h</span>
                <span className="bg-[#242B46] rounded p-1">{countdown.minutes}m</span>
                <span className="bg-[#242B46] rounded p-1">{countdown.seconds}s</span>
            </div>
            <Line />
        </div>
    ) : status === "finalized" ? (
        <div>
            <Line />
            <p className="text-xs text-center text-gray-600 dark:text-[#9CA3AF]">Winner</p>
            {winner ? (
                <p
                    className="text-center text-xs text-blue-400 font-mono truncate px-2"
                    data-testid="winner-address"
                >
                    {winner.slice(0, 6)}…{winner.slice(-6)}
                </p>
            ) : (
                <p className="text-center text-xs text-gray-500">Awaiting result</p>
            )}
        </div>
    ) : (
        /* cancelled — just a divider */
        <Line />
    );

    const cardContent = (
        <>
            {/* Image */}
            <div className="w-full">
                <LazyImage
                    src={imageUrl}
                    alt={title}
                    aspectRatio={16 / 9}
                    containerClassName="w-full rounded-3xl"
                    className="w-full h-full object-cover"
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

            {/* Status section */}
            {statusSection}

            {/* Ticket & Entries */}
            <div className="flex justify-between">
                <div>
                    <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">Ticket price</p>
                    <p>{ticketPrice}</p>
                </div>
                <div>
                    <p className="text-gray-600 dark:text-[#9CA3AF] text-[12px]">Entries</p>
                    <p data-testid="entries-count">{entries}</p>
                </div>
            </div>

            {/* Progress */}
            <ProgressBar value={progress} />
        </>
    );

    const ctaButton = isActive ? (
        <EnterRaffleButton
            raffleId={raffleId}
            ticketPrice={ticketPrice}
            onSuccess={() => onEnter?.()}
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
    );

    return (
        <div className="w-full bg-white dark:bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4">
            {raffleId ? (
                <>
                    <Link
                        to={`/raffles/${raffleId}`}
                        className="flex flex-col space-y-4 cursor-pointer hover:opacity-90 transition-opacity"
                    >
                        {cardContent}
                    </Link>
                    {/* CTA — outside the Link to prevent navigation on button click */}
                    {ctaButton}
                </>
            ) : (
                <>
                    <div className="flex flex-col space-y-4">{cardContent}</div>
                    <button
                        onClick={onEnter}
                        className="border border-gray-500 dark:border-gray-600 px-8 py-4 rounded-xl"
                        data-testid="no-id-btn"
                    >
                        {buttonText}
                    </button>
                </>
            )}
        </div>
    );
};

export default RaffleCard;
