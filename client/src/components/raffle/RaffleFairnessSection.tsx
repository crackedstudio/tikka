import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";

const RaffleFairnessSection = () => {
    const { t } = useTranslation();

    return (
        <div
            className="bg-white dark:bg-[#11172E]/50 border border-gray-200 dark:border-white/5 rounded-3xl p-6 flex items-start space-x-4"
            data-testid="raffle-fairness-section"
        >
            <div className="bg-blue-500/20 p-2 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div className="space-y-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{t("raffle.provablyFair")}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{t("raffle.fairnessDetail")}</p>
            </div>
        </div>
    );
};

export default RaffleFairnessSection;
