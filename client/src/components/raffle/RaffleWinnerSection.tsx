import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";

interface RaffleWinnerSectionProps {
    winner: string;
}

const RaffleWinnerSection = ({ winner }: RaffleWinnerSectionProps) => {
    const { t } = useTranslation();

    return (
        <div
            className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-center space-y-2"
            data-testid="raffle-winner-section"
        >
            <Trophy className="w-8 h-8 text-yellow-500 mx-auto" />
            <p className="text-xs text-yellow-500/80 font-bold uppercase">{t("raffle.winner")}</p>
            <p className="text-sm font-black text-gray-900 dark:text-white truncate px-2">{winner}</p>
            <button className="text-xs text-yellow-500 hover:underline">{t("raffle.viewProof")}</button>
        </div>
    );
};

export default RaffleWinnerSection;
