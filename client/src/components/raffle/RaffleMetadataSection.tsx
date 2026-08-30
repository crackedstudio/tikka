import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Info, User, ExternalLink, Calendar, Wallet } from "lucide-react";
import type { FormattedRaffle } from "../../types/types";
import Line from "../../assets/svg/Line";

interface RaffleMetadataSectionProps {
    raffle: FormattedRaffle;
}

const RaffleMetadataSection = ({ raffle }: RaffleMetadataSectionProps) => {
    const { t } = useTranslation();
    const { description, creator, prizeValue, prizeCurrency, metadata } = raffle;
    const title = metadata?.title || description;

    return (
        <div
            className="bg-white dark:bg-[#11172E] border border-gray-200 dark:border-white/5 rounded-3xl p-8 space-y-6"
            data-testid="raffle-metadata-section"
        >
            <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 dark:text-white">
                    {title}
                </h1>
                <div className="flex items-center space-x-3 text-gray-400">
                    <User className="w-4 h-4" />
                    <span className="text-sm">
                        {t("raffle.createdBy")}{" "}
                        <Link
                            to={`/creators/${creator}`}
                            className="text-gray-900 dark:text-white font-medium hover:text-[#FE3796] dark:hover:text-[#FE3796] transition-colors"
                        >
                            {creator.slice(0, 6)}...{creator.slice(-4)}
                        </Link>
                    </span>
                    <Link to={`/creators/${creator}`}>
                        <ExternalLink className="w-3 h-3 hover:text-[#FE3796] cursor-pointer transition-colors" />
                    </Link>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
                    <Info className="w-5 h-5 text-pink-600 dark:text-[#FE3796]" />
                    <h3 className="text-lg font-bold">{t("raffle.about")}</h3>
                </div>
                <p className="text-gray-400 leading-relaxed">
                    {description || t("raffle.noDescription")}
                </p>
            </div>

            <Line />

            {/* Additional Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.prize")}</p>
                    <p className="text-xl font-black text-yellow-600 dark:text-[#FFD700]">
                        {prizeValue} {prizeCurrency}
                    </p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.started")}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>Mar 2026</span>
                    </p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">{t("raffle.network")}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                        <Wallet className="w-4 h-4 text-gray-400" />
                        <span>Soroban</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default RaffleMetadataSection;
