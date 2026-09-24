import { Ticket, Users, Trophy, ShieldCheck, Bell } from "lucide-react";
import { toast } from "sonner";
import { ProgressBar } from "../ui/ProgressBar";
import AddToCalendar from "../ui/AddToCalendar";
import Line from "../../assets/svg/Line";
import { CountdownTimer } from "../ui/CountdownTimer";
import NotificationSubscribeButton from "../NotificationSubscribeButton";
import { useTranslation } from "react-i18next";

interface RaffleSidebarProps {
  raffleId: number;
  title: string;
  ticketPrice: string;
  ticketPriceFormatted: string;
  prizeCurrency: string;
  progress: number;
  entries: number;
  maxTickets: number;
  endTime: number;
  isActive: boolean;
  isFinalized: boolean;
  winner: string | null;
  ticketCount: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onTicketPurchase: () => void;
}

const RaffleSidebar = ({
  raffleId,
  title,
  ticketPrice,
  ticketPriceFormatted,
  prizeCurrency,
  progress,
  entries,
  maxTickets,
  endTime,
  isActive,
  isFinalized,
  winner,
  ticketCount,
  onIncrement,
  onDecrement,
  onTicketPurchase,
}: RaffleSidebarProps) => {
  const { t } = useTranslation();
  const totalCost = (parseFloat(ticketPrice) * ticketCount).toFixed(3);

  return (
    <div className="space-y-6 sticky top-8">
      <div className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-6">
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
              <span>
                {entries > 10 ? entries - 3 : entries} {t("raffle.unique")}
              </span>
            </span>
          </div>
        </div>

        {isActive ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-black/20 p-1.5 rounded-xl border border-gray-200 dark:border-white/5">
              <button
                onClick={onDecrement}
                className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 text-gray-900 dark:text-white transition-colors"
              >
                -
              </button>
              <span className="text-xl font-bold">{ticketCount}</span>
              <button
                onClick={onIncrement}
                className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#FE3796] hover:brightness-110 text-gray-900 dark:text-white transition-colors"
              >
                +
              </button>
            </div>

            <button
              className="w-full py-4 rounded-xl font-black text-gray-900 dark:text-white tracking-wider shadow-lg shadow-[#FE3796]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              style={{
                background: "linear-gradient(100.92deg, #FE3796 13.57%, #3931F9 97.65%)",
              }}
              onClick={onTicketPurchase}
            >
              {t("raffle.buyFor", { cost: totalCost, currency: prizeCurrency })}
            </button>
            <p className="text-[10px] text-center text-gray-500 uppercase tracking-widest font-bold">
              {t("raffle.secureCheckout")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {isFinalized && winner ? (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center space-y-2">
                <Trophy className="w-8 h-8 text-yellow-500 mx-auto" />
                <p className="text-xs text-yellow-500/80 font-bold uppercase">{t("raffle.winner")}</p>
                <p className="text-sm font-black text-gray-900 dark:text-white truncate px-2">{winner}</p>
                <button className="text-xs text-yellow-500 hover:underline">{t("raffle.viewProof")}</button>
              </div>
            ) : (
              <div className="p-4 bg-gray-500/10 border border-gray-500/20 rounded-2xl text-center">
                <p className="text-sm font-bold text-gray-400">{t("raffle.ended")}</p>
                <p className="text-xs text-gray-500">{t("raffle.noWinnerYet")}</p>
              </div>
            )}
            <button
              disabled
              className="w-full py-4 rounded-xl bg-gray-600/20 text-gray-500 font-bold border border-gray-200 dark:border-white/5 cursor-not-allowed uppercase tracking-widest text-sm"
            >
              {t("raffle.participationClosed")}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 flex items-start space-x-4">
        <div className="bg-blue-500/20 p-2 rounded-lg">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{t("raffle.provablyFair")}</p>
          <p className="text-xs text-gray-500 leading-relaxed">{t("raffle.fairnessDetail")}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 space-y-4">
        <div className="flex items-center space-x-3">
          <div className="bg-purple-500/20 p-2 rounded-lg">
            <Bell className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{t("raffle.stayUpdated")}</p>
            <p className="text-xs text-gray-500">{t("raffle.getNotified")}</p>
          </div>
        </div>
        <NotificationSubscribeButton
          raffleId={raffleId}
          onAuthRequired={() =>
            toast.info("Sign in required", {
              description: "Connect your wallet and sign in to subscribe to notifications.",
            })
          }
        />
      </div>
    </div>
  );
};

export default RaffleSidebar;
