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
        <div className="w-full bg-[#11172E] p-4 rounded-3xl flex space-x-8 border border-[#1F263F] my-5 items-start">
            {/* Image */}
            <div className="w-full">
                <img
                    src={image}
                    alt="Raffle"
                    className="w-full object-cover rounded-3xl"
                />
            </div>
            <div className="flex flex-col space-y-8 w-full">
                {/* Title & Prize */}
                <div>
                    <p className="text-[22px] font-bold">{title}</p>
                    <p className="text-[14px] text-[#9CA3AF] my-3">{body}</p>
                </div>
                <Line />
                <div className="flex justify-between">
                    <div>
                        <p className="text-[#9CA3AF] text-sm">Prize Value: </p>
                        <p className="font-bold text-[#FFD700] text-[22px]">
                            {prizeValue} {prizeCurrency}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-right text-[#9CA3AF] mb-2">
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
                    </div>
                </div>
                <Line />

                {/* Countdown */}

                {/* Ticket & Entries */}
                <div className="flex justify-between">
                    <div>
                        <p className="text-[#9CA3AF] text-[12px]">
                            Ticket price
                        </p>
                        <p>{ticketPrice}</p>
                    </div>
                    <div>
                        <p className="text-[#9CA3AF] text-[12px]">Entries</p>
                        <p>{entries}</p>
                    </div>
                </div>

                {/* Progress */}
                <ProgressBar value={progress} />

                {/* CTA */}
                <button
                    onClick={onEnter}
                    className="px-8 py-4 rounded-xl text-white font-medium transition"
                    style={{
                        background:
                            "linear-gradient(100.92deg, #A259FF 13.57%, #FF6250 97.65%)",
                    }}
                >
                    {buttonText}
                </button>
            </div>
        </div>
    );
};

export default FeaturedRaffleCard;
