// RaffleDetailsCard.tsx
import React from "react";
import Line from "../../assets/svg/Line";
import AboutRaffle from "../AboutRaffle";
import EnterRaffle from "../EnterRaffle";
import RecentParticipants from "../RecentParticipants";
import ImageCarousel from "../ImageCarousel";
import { CountdownTimer } from "../ui/CountdownTimer";

type RaffleDetailsCardProps = {
    image: string;
    images?: string[];
    title: string;
    body: string;
    prizeValue: string;
    prizeCurrency?: string; // default "ETH"
    countdown: Countdown;
    /** Ticket price amount */
    ticketPrice?: string;
    /** Asset symbol for ticket price, e.g. "XLM", "USDC" */
    ticketAsset?: string;
    onEnter?: () => void; // optional click handler
};

const RaffleDetailsCard: React.FC<RaffleDetailsCardProps> = ({
    image,
    images,
    title,
    body,
    prizeValue,
    prizeCurrency = "ETH",
    countdown,
    ticketPrice,
    ticketAsset = "XLM",
    onEnter,
}) => {
    // Use images array if available, otherwise fallback to single image
    const displayImages = images && images.length > 0 ? images : [image];

    return (
        <div className="w-full p-4 md:p-6 lg:p-8 rounded-3xl my-5 flex flex-col space-y-8">
            {/* Top: image + main content */}
            <div className="flex flex-col gap-6 md:flex-row md:gap-8 items-stretch">
                {/* Image/Carousel (stacks on top for mobile) */}
                <div className="w-full md:w-1/2">
                    <ImageCarousel images={displayImages} alt={title} />
                </div>

                {/* Content */}
                <div className="w-full md:w-1/2 flex flex-col space-y-5">
                    {/* Title & Body */}
                    <div>
                        <p className="text-2xl md:text-3xl lg:text-[38px] font-bold">
                            {title}
                        </p>
                        <p className="text-base md:text-[20px] text-gray-600 dark:text-[#9CA3AF] mt-3">
                            {body}
                        </p>
                    </div>

                    <Line />

                    {/* Prize + Countdown */}
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-gray-600 dark:text-[#9CA3AF] text-sm">
                                Prize Value:
                            </p>
                            <p className="font-bold text-yellow-600 dark:text-[#FFD700] text-xl md:text-[38px]">
                                {prizeValue} {prizeCurrency}
                            </p>
                        </div>

                        {ticketPrice && (
                            <>
                                <Line />
                                <div>
                                    <p className="text-gray-600 dark:text-[#9CA3AF] text-sm">
                                        Ticket Price:
                                    </p>
                                    <p className="font-bold text-xl">
                                        {ticketPrice}{" "}
                                        <span className="text-sm font-normal text-gray-500 dark:text-[#9CA3AF]">
                                            {ticketAsset}
                                        </span>
                                    </p>
                                </div>
                            </>
                        )}

                        <Line />

                        <div>
                            <p className="text-xs text-gray-600 dark:text-[#9CA3AF] mb-2">
                                Ends In
                            </p>
                            <CountdownTimer 
                                endTime={endTime}
                                className="flex flex-wrap gap-2 text-sm md:text-[18px]"
                                itemClassName="bg-[#242B46] rounded-[4px] font-semibold px-2 py-0.5 text-white"
                            />
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
