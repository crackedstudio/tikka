interface RaffleWinnerBannerProps {
    isWinner: boolean;
}

const RaffleWinnerBanner = ({ isWinner }: RaffleWinnerBannerProps) => {
    if (!isWinner) {
        return null;
    }

    return (
        <div className="bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 p-1 rounded-3xl mb-6 animate-pulse">
            <div className="bg-white dark:bg-[#11172E] rounded-[22px] p-8 text-center shadow-2xl">
                <div className="text-5xl mb-4">🏆</div>
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">
                    CONGRATULATIONS!
                </h2>
                <p className="text-lg text-gray-600 dark:text-pink-200 font-medium">
                    You are the winner of this raffle! 🎉
                </p>
            </div>
        </div>
    );
};

export default RaffleWinnerBanner;
