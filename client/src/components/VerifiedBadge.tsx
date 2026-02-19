import { CircleQuestionMark, MoveRight } from "lucide-react";
import chainlink from "../assets/chainlink.png";
import verified from "../assets/verified.png";

const VerifiedBadge = () => {
    return (
        <div className="mt-16 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: copy */}
            <div className="lg:w-1/2">
                <h2 className="flex items-center gap-2 text-xl md:text-2xl font-semibold">
                    <CircleQuestionMark color="#00E5FF" />
                    <span>Provably Fair Raffles</span>
                </h2>

                <p className="text-[#9CA3AF] mt-3">
                    VeriWin uses Chainlink VRF (Verifiable Random Function) to
                    ensure all winners are selected through a provably fair and
                    tamper-proof random selection process.
                </p>

                <button className="mt-3 inline-flex items-center gap-2 text-[#00E5FF] hover:underline">
                    <span>Learn how our raffles work</span> <MoveRight />
                </button>
            </div>

            {/* Right: badges */}
            <div className="flex gap-4 lg:w-auto">
                <div className="bg-[#19192B] p-4 rounded-xl flex items-center gap-3">
                    <img
                        src={chainlink}
                        alt="Chainlink VRF"
                        className="h-10 w-10"
                    />
                    <div className="flex flex-col leading-tight">
                        <p className="text-xs md:text-sm text-white/70">
                            Powered by
                        </p>
                        <p className="font-medium md:text-lg text-sm">
                            Chainlink VRF
                        </p>
                    </div>
                </div>

                <div className="bg-[#19192B] p-4 rounded-xl flex items-center gap-3">
                    <img
                        src={verified}
                        alt="Verified Contract"
                        className="h-10 w-10"
                    />
                    <div className="flex flex-col leading-tight">
                        <p className="text-sm text-white/70">Smart Contract</p>
                        <p className="font-medium">Verified</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerifiedBadge;
