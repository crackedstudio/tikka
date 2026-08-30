import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ticket, Users } from "lucide-react";
import { ProgressBar } from "../ui/ProgressBar";
import { CountdownTimer } from "../ui/CountdownTimer";
import AddToCalendar from "../ui/AddToCalendar";
import Line from "../../assets/svg/Line";
import RaffleWinnerSection from "./RaffleWinnerSection";

interface RafflePurchaseSectionProps {
    ticketPrice: string;
    ticketPriceFormatted: string;
    prizeCurrency: string;
    entries: number;
    maxTickets: number;
    progress: number;
    endTime: number;
    isActive: boolean;
    isFinalized: boolean;
    winner: string | null;
    title: string;
    onPurchase: (ticketCount: number) => void;
}

const RafflePurchaseSection = ({
    ticketPrice,
    ticketPriceFormatted,
    prizeCurrency,
    entries,
    maxTickets,
    progress,
    endTime,
    isActive,
    isFinalized,
    winner,
    title,
    onPurchase,
}: RafflePurchaseSectionProps) => {
    const { t } = useTranslation();
    const [ticketCount, setTicketCount] = useState(1);

    const handleIncrement = () => setTicketCount((prev) => Math.min(prev + 1, maxTickets - entries));
    const handleDecrement = () => setTicketCount((prev) => Math.max(prev - 1, 1));
    const totalCost = (parseFloat(ticketPrice) * ticketCount).toFixed(3);

    return (
        <div
            className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6"
            data-testid="raffle-purchase-section"
        >
            <div className="space-y-1">
                <p className="text-sm text-gray-400 font-medium">{t("raffle.ticketPrice")}</p>
                <p className="text-3xl font-black text-gray-900 dark:text-white">{ticketPriceFormatted}</p>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2 text-gray-400">
                        <Ticket className="w-4 h-4" />
                        <span>{t("raffle.progress")}</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white">
                        {entries} / {maxTickets} {t("raffle.sold")}
                    </span>
                </div>
                <ProgressBar value={progress} height="8px" />
            </div>

            <div className="p-4 bg-gray-200 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">{t("raffle.endsIn")}</span>
                    <CountdownTimer endTime={endTime} />
                </div>
                {isActive && (
                    <AddToCalendar title={title} endTimeUnix={endTime} />
                )}
                <Line />
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">{t("raffle.totalParticipants")}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-1">
                        <Users className="w-4 h-4 text-pink-600 dark:text-[#FE3796]" />
                        <span>{entries > 10 ? entries - 3 : entries} {t("raffle.unique")}</span>
                    </span>
                </div>
            </div>

            {isFinalized && winner ? (
                <RaffleWinnerSection winner={winner} />
            ) : isActive ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-black/20 p-1.5 rounded-xl border border-gray-200 dark:border-white/5">
                        <button
                            onClick={handleDecrement}
                            className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 text-gray-900 dark:text-white transition-colors"
                            aria-label={t("raffle.decrementTickets")}
                            data-testid="decrement-tickets"
                        >
                            -
                        </button>
                        <span className="text-xl font-bold" data-testid="ticket-count">{ticketCount}</span>
                        <button
                            onClick={handleIncrement}
                            className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#FE3796] hover:brightness-110 text-gray-900 dark:text-white transition-colors"
                            aria-label={t("raffle.incrementTickets")}
                            data-testid="increment-tickets"
                        >
                            +
                        </button>
                    </div>

                    <button
                        className="w-full py-4 rounded-xl font-black text-gray-900 dark:text-white tracking-wider shadow-lg shadow-[#FE3796]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        style={{
                            background: "linear-gradient(100.92deg, #FE3796 13.57%, #3931F9 97.65%)",
                        }}
                        onClick={() => onPurchase(ticketCount)}
                        data-testid="buy-tickets-button"
                    >
                        {t("raffle.buyFor", { cost: totalCost, currency: prizeCurrency })}
                    </button>
                    <p className="text-[10px] text-center text-gray-500 uppercase tracking-widest font-bold">
                        {t("raffle.secureCheckout")}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-2xl text-center">
                        <p className="text-sm font-bold text-gray-400">{t("raffle.ended")}</p>
                        <p className="text-xs text-gray-500">{t("raffle.noWinnerYet")}</p>
                    </div>
                    <button
                        disabled
                        className="w-full py-4 rounded-xl bg-gray-600/20 text-gray-500 font-bold border border-gray-200 dark:border-white/5 cursor-not-allowed uppercase tracking-widest text-sm"
                    >
                        {t("raffle.participationClosed")}
                    </button>
                </div>
            )}
        </div>
    );
};

export default RafflePurchaseSection;
