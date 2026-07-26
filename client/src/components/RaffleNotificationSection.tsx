import { toast } from "sonner";
import NotificationSubscribeButton from "./NotificationSubscribeButton";

interface RaffleNotificationSectionProps {
    raffleId: number;
}

const RaffleNotificationSection = ({
    raffleId,
}: RaffleNotificationSectionProps) => {
    return (
        <div className="bg-white dark:bg-[#11172E] rounded-3xl p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Stay Updated
                    </h3>
                    <p className="text-gray-400 text-sm">
                        Get notified when this raffle ends or when you win
                    </p>
                </div>
                <NotificationSubscribeButton
                    raffleId={raffleId}
                    onAuthRequired={() => {
                        toast.info("Sign in required", {
                            description:
                                "Please connect your wallet and sign in to subscribe to notifications.",
                        });
                    }}
                />
            </div>
        </div>
    );
};

export default RaffleNotificationSection;
