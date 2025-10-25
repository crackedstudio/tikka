// RaffleCard.tsx
import React from "react";
import { ProgressBar } from "../ui/ProgressBar";
import Line from "../../assets/svg/Line";
import EnterRaffleButton from "../EnterRaffleButton";

type Countdown = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
};

type RaffleCardProps = {
    image: string;
    title: string;
    prizeValue: string;
    prizeCurrency?: string; // default "ETH"
    countdown: Countdown;
    ticketPrice: string;
    entries: number;
    progress: number; // 0–100
    buttonText?: string;
    onEnter?: () => void; // optional click handler
    raffleId?: number; // Contract raffle ID
};

const RaffleCard: React.FC<RaffleCardProps> = ({
    image,
    title,
    prizeValue,
    prizeCurrency = "ETH",
    countdown,
    ticketPrice,
    entries,
    progress,
    buttonText = "Enter Raffle",
    onEnter,
    raffleId,
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
            <div>
                <p className="text-[22px] font-bold">{title}</p>
                <p className="text-[#9CA3AF] text-sm">
                    Prize Value:{" "}
                    <span className="font-bold text-[#FFD700]">
                        {prizeValue} {prizeCurrency}
                    </span>
                </p>
            </div>

            {/* Countdown */}
            <div>
                <Line />
                <p className="text-xs text-center text-[#9CA3AF]">Ends In</p>
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

            {/* CTA */}
            {raffleId ? (
                <EnterRaffleButton
                    raffleId={raffleId}
                    ticketPrice={ticketPrice}
                    onSuccess={() => {
                        console.log("Ticket purchased successfully!");
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
                    onClick={onEnter}
                    className="border border-[#fe3796] px-8 py-4 rounded-xl hover:bg-[#fe3796]/10 transition"
                >
                    {buttonText}
                </button>
            )}
        </div>
    );
};

export default RaffleCard;
