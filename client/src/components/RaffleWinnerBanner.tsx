import type { WinnerAnnouncementProps } from "../types/types";

interface RaffleWinnerBannerProps
    extends Pick<
        WinnerAnnouncementProps,
        "prizeName" | "prizeValue" | "walletAddress"
    > {
    isWinner: boolean;
}

const RaffleWinnerBanner = ({
    isWinner,
    prizeName = "Lamborghini Aventador, Limited Edition 2023",
    prizeValue = "$500,000",
    walletAddress = "0x330cd8fec...8b7c",
}: RaffleWinnerBannerProps) => {
    if (!isWinner) {
        return null;
    }

    const visibleAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`;

    return (
        <div className="bg-gradient-to-r from-yellow-400 via-pink-500 to-fuchsia-600 p-1 rounded-[28px] mb-6 shadow-[0_24px_80px_rgba(236,72,153,0.28)]">
            <div className="bg-[#0E1226] rounded-[24px] p-6 sm:p-8 text-center border border-white/10">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-white/10 text-4xl mb-4">
                    🏆
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">
                    CONGRATULATIONS!
                </h2>
                <p className="text-base sm:text-lg text-pink-100/90 font-medium mb-5">
                    You are the winner of this raffle.
                </p>

                <div className="grid gap-3 sm:grid-cols-3 text-left">
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-pink-200/70 mb-1">
                            Prize
                        </div>
                        <div className="text-sm sm:text-base text-white font-semibold leading-snug">
                            {prizeName}
                        </div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-pink-200/70 mb-1">
                            Value
                        </div>
                        <div className="text-sm sm:text-base text-white font-semibold leading-snug">
                            {prizeValue}
                        </div>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <div className="text-xs uppercase tracking-[0.24em] text-pink-200/70 mb-1">
                            Winner wallet
                        </div>
                        <div className="text-sm sm:text-base text-white font-semibold leading-snug font-mono">
                            {visibleAddress}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RaffleWinnerBanner;
