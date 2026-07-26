import { toast } from "sonner";
import { useWalletContext } from "../providers";
import EnterRaffleButton from "./EnterRaffleButton";

interface RaffleTicketPurchaseSectionProps {
    raffleId: number;
    ticketPrice: number;
    status: string;
    winner?: string;
    onSuccess: () => void;
}

const RaffleTicketPurchaseSection = ({
    raffleId,
    ticketPrice,
    status,
    winner,
    onSuccess,
}: RaffleTicketPurchaseSectionProps) => {
    const { address } = useWalletContext();
    const lowerStatus = status?.toLowerCase() || "";
    const isFinalized =
        lowerStatus === "closed" ||
        lowerStatus === "finalized" ||
        lowerStatus === "cancelled";

    const ctaLabel =
        lowerStatus === "cancelled"
            ? "Claim Refund"
            : winner
                ? "View Winner"
                : isFinalized
                    ? "Raffle Ended"
                    : "Buy Ticket";

    const isPurchaseDisabled = isFinalized || winner;

    return (
        <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Purchase Ticket
            </h3>

            <div className="mb-6">
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                    Ticket Price: <span className="font-semibold">{ticketPrice}</span>
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                    {isPurchaseDisabled
                        ? "This raffle is no longer accepting purchases."
                        : "Click the button below to purchase a ticket."}
                </p>
            </div>

            <div className="mt-6">
                {isPurchaseDisabled ? (
                    <button
                        disabled
                        className="border border-gray-300 dark:border-gray-600 px-8 py-3 rounded-xl text-gray-400 dark:text-gray-500 cursor-not-allowed"
                    >
                        {ctaLabel}
                    </button>
                ) : (
                    <EnterRaffleButton
                        raffleId={raffleId}
                        ticketPrice={ticketPrice}
                        className="border border-pink-500 dark:border-[#fe3796] px-8 py-3 rounded-xl hover:bg-[#fe3796]/10 transition"
                        onSuccess={onSuccess}
                        onError={(message) => toast.error(message)}
                    >
                        {ctaLabel}
                    </EnterRaffleButton>
                )}
            </div>
        </div>
    );
};

export default RaffleTicketPurchaseSection;
