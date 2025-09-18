// RecentlyAddedCard.tsx
import React from "react";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";

type Countdown = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
};

type RecentlyAddedCardProps = {
    image: string;
    title: string;
    countdown: Countdown;
    ticketPrice: string;
    entries: number;
    progress: number; // 0–100
};

const RecentlyAddedCard: React.FC<RecentlyAddedCardProps> = ({
    image,
    title,
    countdown,
    ticketPrice,
    entries,
    progress,
}) => {
    return (
        <div className="w-full bg-[#11172E] p-4 rounded-3xl flex flex-col space-y-4">
            {/* Image */}
            <div className="w-full">
                <img
                    src={image}
                    alt="Raffle"
                    className="w-full object-cover rounded-3xl"
                />
            </div>

            {/* Title & Prize */}
            <div className="flex flex-col space-y-2">
                <p className="text-[14px] font-bold">{title}</p>
                {/* Countdown */}
                <div className="flex space-x-2'">
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

            {/* Ticket & Entries */}
            <div className="flex justify-between">
                <div>
                    <p className="text-[#9CA3AF] text-[12px]">Ticket price</p>
                    <p>{ticketPrice}</p>
                </div>
                <div>
                    <p className="text-[#9CA3AF] text-[12px]">Entries</p>
                    <p>{entries}</p>
                </div>
            </div>

            {/* Progress */}
            <ProgressBar value={progress} />
        </div>
    );
};

export default RecentlyAddedCard;
