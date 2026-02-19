import Union from "../assets/Union.png";
import { Facebook, Link, Send, Twitter } from "lucide-react";

const ShareRaffle = () => {
    return (
        <div className="bg-[#11172E] rounded-3xl flex flex-col md:flex-row justify-between items-center border border-[#1F263F] mt-8 overflow-hidden">
            {/* Left Section */}
            <div className="p-8 flex-1">
                <h3 className="text-[22px] font-semibold text-white">
                    Share This Raffle
                </h3>
                <p className="mt-3 text-[#9CA3AF] text-sm md:text-base">
                    Invite your friends to join and increase the excitement!
                </p>

                {/* Social Links */}
                <div className="mt-5 flex space-x-3">
                    <a
                        href="#"
                        className="p-2 rounded-full bg-[#090E1F] hover:bg-[#00E6CC]/10 transition"
                    >
                        <Twitter className="w-5 h-5" color="#00E6CC" />
                    </a>
                    <a
                        href="#"
                        className="p-2 rounded-full bg-[#090E1F] hover:bg-[#00E6CC]/10 transition"
                    >
                        <Facebook className="w-5 h-5" color="#00E6CC" />
                    </a>
                    <a
                        href="#"
                        className="p-2 rounded-full bg-[#090E1F] hover:bg-[#00E6CC]/10 transition"
                    >
                        <Send className="w-5 h-5" color="#00E6CC" />
                    </a>
                    <a
                        href="#"
                        className="p-2 rounded-full bg-[#090E1F] hover:bg-[#00E6CC]/10 transition"
                    >
                        <Link className="w-5 h-5" color="#00E6CC" />
                    </a>
                </div>
            </div>

            {/* Right Section (Image) */}
            <div className="md:flex-shrink-0 hidden w-full md:w-auto ">
                <img
                    src={Union}
                    alt="union"
                    className="w-full md:w-auto object-contain"
                />
            </div>
        </div>
    );
};

export default ShareRaffle;
