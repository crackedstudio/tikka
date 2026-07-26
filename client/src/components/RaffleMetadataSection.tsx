import type { FormattedRaffle } from "../types/types";

interface RaffleMetadataSectionProps {
    raffle: FormattedRaffle;
}

const RaffleMetadataSection = ({ raffle }: RaffleMetadataSectionProps) => {
    const statusLabel = raffle.status?.toUpperCase() || "UNKNOWN";

    return (
        <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Raffle Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Status</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {statusLabel}
                    </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Ticket Price</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {raffle.ticketPriceFormatted}
                    </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Tickets Sold</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {raffle.totalTicketsSold} / {raffle.maxTickets}
                    </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Ends At</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {new Date(raffle.endTime * 1000).toLocaleString()}
                    </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Winner</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {raffle.winner || "-"}
                    </span>
                </div>
                <div className="flex justify-between border-b border-gray-200 dark:border-[#1F263F] pb-2">
                    <span className="text-gray-400">Category</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                        {raffle.metadata?.category || "General"}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default RaffleMetadataSection;
