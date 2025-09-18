// FeaturedRaffleCard.tsx
import React from "react";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";

type Countdown = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
};

type FeaturedRaffleCardProps = {
    image: string;
    title: string;
    body: string;
    prizeValue: string;
    prizeCurrency?: string; // default "ETH"
    countdown: Countdown;
    ticketPrice: string;
    entries: number;
    progress: number; // 0–100
    buttonText?: string;
    onEnter?: () => void; // optional click handler
};

const FeaturedRaffleCard: React.FC<FeaturedRaffleCardProps> = ({
    image,
    title,
    body,
    prizeValue,
    prizeCurrency = "ETH",
    countdown,
    ticketPrice,
    entries,
    progress,
    buttonText = "Enter Raffle",
    onEnter,
}) => {
    return (
        <div className="w-full bg-[#11172E] p-4 md:p-6 lg:p-8 rounded-3xl border border-[#1F263F] my-5">
            <div className="flex flex-col gap-6 md:flex-row md:gap-8 items-stretch">
                {/* Image (stacks on top for mobile) */}
                <div className="w-full md:w-1/2">
                    <img
                        src={image}
                        alt={title}
                        className="w-full h-auto rounded-2xl object-cover"
                    />
                </div>

                {/* Content */}
                <div className="w-full md:w-1/2 flex flex-col space-y-6">
                    {/* Title & Body */}
                    <div>
                        <p className="text-2xl md:text-3xl font-bold">
                            {title}
                        </p>
                        <p className="text-sm md:text-base text-[#9CA3AF] mt-3">
                            {body}
                        </p>
                    </div>

                    <Line />

                    {/* Prize + Countdown */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-[#9CA3AF] text-sm">
                                Prize Value:
                            </p>
                            <p className="font-bold text-[#FFD700] text-xl md:text-2xl">
                                {prizeValue} {prizeCurrency}
                            </p>
                        </div>

                        <div className="sm:text-right">
                            <p className="text-xs text-[#9CA3AF] mb-2">
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
                        </div>
                    </div>

                    <Line />

                    {/* Ticket & Entries */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-[#9CA3AF] text-[12px]">
                                Ticket price
                            </p>
                            <p className="text-sm md:text-base">
                                {ticketPrice}
                            </p>
                        </div>
                        <div>
                            <p className="text-[#9CA3AF] text-[12px]">
                                Entries
                            </p>
                            <p className="text-sm md:text-base">{entries}</p>
                        </div>
                    </div>

                    {/* Progress */}
                    <ProgressBar value={progress} />

                    {/* CTA */}
                    <button
                        onClick={onEnter}
                        className="w-full md:w-auto self-stretch md:self-start px-8 py-4 rounded-xl text-white font-medium transition"
                        style={{
                            background:
                                "linear-gradient(100.92deg, #A259FF 13.57%, #FF6250 97.65%)",
                        }}
                    >
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FeaturedRaffleCard;
