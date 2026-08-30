import { forwardRef } from "react";
import RecentParticipants, { type RecentParticipantsHandle } from "../RecentParticipants";

interface RaffleParticipantsSectionProps {
    raffleId: number;
    currentUserAddress?: string;
}

const RaffleParticipantsSection = forwardRef<RecentParticipantsHandle, RaffleParticipantsSectionProps>(
    ({ raffleId, currentUserAddress }, ref) => {
        return (
            <div
                className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/5 rounded-3xl p-8"
                data-testid="raffle-participants-section"
            >
                <RecentParticipants
                    raffleId={raffleId}
                    currentUserAddress={currentUserAddress}
                    ref={ref}
                />
            </div>
        );
    }
);

RaffleParticipantsSection.displayName = "RaffleParticipantsSection";

export default RaffleParticipantsSection;
