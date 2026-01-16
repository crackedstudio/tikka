import Line from "../assets/svg/Line";

interface EnterRaffleProps {
    handleEnterRaffle: () => void;
}

const EnterRaffle = ({ handleEnterRaffle }: EnterRaffleProps) => {
    return (
        <div className="bg-[#11172E] border border-[#1F263F] rounded-[30px] w-full px-4 py-5 md:px-6 md:py-6 flex flex-col space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <p className="text-[20px] md:text-[22px] font-semibold">
                    Enter Raffle
                </p>
                <span className="bg-[#00E6CC33] px-3 py-1 text-[#00E6CC] text-[12px] rounded-full whitespace-nowrap">
                    Max 100 per entry
                </span>
            </div>

            <Line />

            {/* Price + Quantity */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Price block */}
                <div className="min-w-0">
                    <p className="text-xs text-[#9CA3AF]">Price per ticket</p>
                    <p className="text-[20px] md:text-[22px] font-medium">
                        0.05 ETH
                    </p>
                    <p className="text-xs text-[#9CA3AF]">≈ $85.45 USD</p>
                </div>

                {/* Quantity controls - centered on mobile */}
                <div className="flex items-center justify-start sm:justify-end gap-3">
                    <button
                        aria-label="decrease"
                        className="h-9 w-9 rounded-lg bg-[#00E6CC33] text-[#00E6CC] text-[18px] flex items-center justify-center hover:brightness-95"
                    >
                        −
                    </button>

                    <div className="min-w-[36px] text-center">
                        <p className="text-base md:text-lg font-medium">22</p>
                    </div>

                    <button
                        aria-label="increase"
                        className="h-9 w-9 rounded-lg bg-[#00E6CC33] text-[#00E6CC] text-[18px] flex items-center justify-center hover:brightness-95"
                    >
                        +
                    </button>
                </div>
            </div>

            <Line />

            {/* Total */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-[#9CA3AF]">Total</p>
                <p className="text-[14px] md:text-[14px] font-semibold">
                    0.05 ETH
                </p>
            </div>

            {/* CTA */}
            <div className="w-full">
                <button
                    onClick={handleEnterRaffle}
                    className="w-full md:w-auto block px-8 py-3 md:px-10 md:py-4 rounded-xl text-white font-medium transition"
                    style={{
                        background:
                            "linear-gradient(100.92deg, #A259FF 13.57%, #FF6250 97.65%)",
                    }}
                >
                    <span>Enter Raffle</span>
                </button>
            </div>

            <p className="text-center text-[#6B7280] text-xs">
                Demo mode - no gas fees
            </p>
        </div>
    );
};

export default EnterRaffle;
