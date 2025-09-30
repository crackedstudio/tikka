// RaffleDetailsCard.tsx
import React from "react";
import Line from "../../assets/svg/Line";
import AboutRaffle from "../AboutRaffle";
import EnterRaffle from "../EnterRaffle";
import RecentParticipants from "../RecentParticipants";

type Countdown = {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
};

type RaffleDetailsCardProps = {
    image: string;
    title: string;
    body: string;
    prizeValue: string;
    prizeCurrency?: string; // default "ETH"
    countdown: Countdown;
    onEnter?: () => void; // optional click handler
};

const RaffleDetailsCard: React.FC<RaffleDetailsCardProps> = ({
    image,
    title,
    body,
    prizeValue,
    prizeCurrency = "ETH",
    countdown,
    onEnter,
}) => {
    return (
        <div className="w-full p-4 md:p-6 lg:p-8 rounded-3xl my-5 flex flex-col space-y-8">
            {/* Top: image + main content */}
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
                <div className="w-full md:w-1/2 flex flex-col space-y-5">
                    {/* Title & Body */}
                    <div>
                        <p className="text-2xl md:text-3xl lg:text-[38px] font-bold">
                            {title}
                        </p>
                        <p className="text-base md:text-[20px] text-[#9CA3AF] mt-3">
                            {body}
                        </p>
                    </div>

                    <Line />

                    {/* Prize + Countdown */}
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-[#9CA3AF] text-sm">
                                Prize Value:
                            </p>
                            <p className="font-bold text-[#FFD700] text-xl md:text-[38px]">
                                {prizeValue} {prizeCurrency}
                            </p>
                        </div>

                        <Line />

                        <div>
                            <p className="text-xs text-[#9CA3AF] mb-2">
                                Ends In
                            </p>
                            <div className="flex flex-wrap gap-2 text-sm md:text-[18px]">
                                <span className="bg-[#242B46] rounded-[4px] font-semibold px-2 py-0.5">
                                    {countdown.days}d
                                </span>
                                <span className="bg-[#242B46] rounded-[4px] font-semibold px-2 py-0.5">
                                    {countdown.hours}h
                                </span>
                                <span className="bg-[#242B46] rounded-[4px] font-semibold px-2 py-0.5">
                                    {countdown.minutes}m
                                </span>
                                <span className="bg-[#242B46] rounded-[4px] font-semibold px-2 py-0.5">
                                    {countdown.seconds}s
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom: AboutRaffle + EnterRaffle */}
            {/* Stack on small screens, row on md+ (preserves desktop look) */}
            <div className="w-full flex flex-col-reverse gap-6 md:flex-row md:items-start md:gap-12">
                {/* Left: About (takes remaining space on md+) */}
                <div className="w-full md:flex-1">
                    <AboutRaffle />
                </div>

                {/* Right: Enter card (fixed-ish width on md+, full width on mobile) */}
                <div className="w-full md:w-[380px]">
                    <EnterRaffle handleEnterRaffle={onEnter || (() => {})} />
                </div>
            </div>

            <Line />

            <RecentParticipants />
        </div>
    );
};

export default RaffleDetailsCard;
