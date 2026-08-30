import { ArrowLeft, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import VerifiedBadge from "../VerifiedBadge";

interface RaffleNavHeaderProps {
    onBack: () => void;
    onShare?: () => void;
}

const RaffleNavHeader = ({ onBack, onShare }: RaffleNavHeaderProps) => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-between">
            <button
                onClick={onBack}
                className="flex items-center space-x-2 text-gray-400 hover:text-gray-900 dark:text-white transition-colors group"
                aria-label={t("raffle.back")}
                data-testid="raffle-back-button"
            >
                <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="font-medium">{t("raffle.back")}</span>
            </button>
            <div className="flex items-center space-x-3">
                <button
                    onClick={onShare}
                    className="p-2 rounded-xl bg-gray-200 dark:bg-white/5 hover:bg-gray-300 dark:bg-white/10 transition-colors text-gray-400 hover:text-gray-900 dark:text-white"
                    aria-label={t("raffle.share")}
                    data-testid="raffle-share-button"
                >
                    <Share2 className="w-5 h-5" />
                </button>
                <VerifiedBadge />
            </div>
        </div>
    );
};

export default RaffleNavHeader;
