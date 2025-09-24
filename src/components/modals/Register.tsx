import { WalletMinimal } from "lucide-react";
import type { TrendingTabProps } from "../../types/types";
import Google from "../../assets/svg/Google";
import Line from "../../assets/svg/Line";
import RocketLaunch from "../../assets/svg/RocketLaunch";
const OPTIONS = ["Log In", "Sign Up"] as const;

const Register = ({ activeTab, changeActiveTab }: TrendingTabProps) => {
    return (
        <div className="w-full">
            <div>
                {/* Desktop: tabs */}
                <div className="flex items-center justify-center gap-8 mt-6">
                    {OPTIONS.map((opt) => {
                        const isActive = activeTab === opt;
                        return (
                            <button
                                key={opt}
                                onClick={() => changeActiveTab(opt)}
                                className={[
                                    "pb-2 text-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                                    isActive
                                        ? "text-white border-b-2 border-[#858584]"
                                        : "text-[#858584] hover:text-white/80",
                                ].join(" ")}
                                aria-current={isActive ? "page" : undefined}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>
            </div>
            {activeTab == "Sign Up" && (
                <div className="mt-5">
                    <div className="flex flex-col space-y-4">
                        <button className="w-full flex space-x-2 justify-center items-center py-3 border border-[#353F64] rounded-xl">
                            <WalletMinimal color="#0058F7" />
                            <span>Continue With Wallet</span>
                        </button>
                        <button className="w-full flex space-x-2 justify-center items-center py-3 border border-[#353F64] rounded-xl">
                            <Google />
                            <span>Continue with Google</span>
                        </button>
                    </div>
                    <div className="mt-2 flex  ">
                        <div className="grow-0">
                            {" "}
                            <Line />
                        </div>

                        <p className="grow text-xs">Or Continue With Email</p>
                        <div className="grow-0">
                            {" "}
                            <Line />
                        </div>
                    </div>
                    <div className="mt-3 flex flex-col space-y-2">
                        <input
                            type="text"
                            className="bg-[#060C23] border border-[#353F64] text-white px-2 py-2 rounded-xl"
                            placeholder="Username"
                        />
                        <input
                            type="email"
                            className="bg-[#060C23] border border-[#353F64] text-white px-2 py-2 rounded-xl"
                            placeholder="Email Address"
                        />
                        <input
                            type="password"
                            className="bg-[#060C23] border border-[#353F64] text-white px-2 py-2 rounded-xl"
                            placeholder="Password"
                        />
                    </div>
                    <div className="mt-3">
                        <button className="bg-[#fe3796] px-10 md:px-16 py-4 rounded-xl flex items-center justify-center space-x-4 mx-auto md:mx-0 w-full">
                            <RocketLaunch />
                            <span>Get Started</span>
                        </button>
                    </div>
                    <p className="my-8 text-xs text-center text-[#9CA3AF]">
                        By proceding, you agree to Tikka’s{" "}
                        <span className="text-[#fe3796]">
                            {" "}
                            Terms of Service{" "}
                        </span>
                        and{" "}
                        <span className="text-[#fe3796]"> Privacy Policy</span>
                    </p>
                </div>
            )}
        </div>
    );
};

export default Register;
