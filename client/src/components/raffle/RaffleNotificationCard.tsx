import { Bell } from "lucide-react";
import { toast } from "sonner";
import NotificationSubscribeButton from "../NotificationSubscribeButton";
import { useTranslation } from "react-i18next";

interface RaffleNotificationCardProps {
  raffleId: number;
}

const RaffleNotificationCard = ({ raffleId }: RaffleNotificationCardProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 space-y-4">
      <div className="flex items-center space-x-3">
        <div className="bg-purple-500/20 p-2 rounded-lg">
          <Bell className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {t("raffle.stayUpdated")}
          </p>
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
  );
};

export default RaffleNotificationCard;
