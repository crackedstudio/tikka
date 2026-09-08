import { Clock, ShieldCheck } from "lucide-react";
import LazyImage from "../LazyImage";
import detailimage from "../../assets/detailimage.png";
import { useTranslation } from "react-i18next";

interface RaffleHeroProps {
  image?: string;
  title: string;
  isActive: boolean;
  isFinalized: boolean;
}

const RaffleHero = ({ image, title, isActive, isFinalized }: RaffleHeroProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl z-10" />
      <LazyImage
        src={image || detailimage}
        alt={title}
        aspectRatio={16 / 9}
        containerClassName="w-full rounded-3xl shadow-2xl border border-gray-200 dark:border-white/5"
        className="w-full h-full object-cover md:max-h-[500px]"
        blurUp={false}
      />
      <div className="absolute top-6 left-6 z-20">
        {isActive ? (
          <div className="flex items-center space-x-2 bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full border border-green-500/30 backdrop-blur-md shadow-lg">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {t("raffle.liveNow")}
            </span>
          </div>
        ) : isFinalized ? (
          <div className="flex items-center space-x-2 bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-md shadow-lg">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {t("raffle.finalized")}
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-2 bg-gray-500/20 text-gray-400 px-4 py-1.5 rounded-full border border-gray-500/30 backdrop-blur-md shadow-lg">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {t("raffle.ended")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RaffleHero;
