import logo from "../../assets/svg/logo.svg";
import tikka from "../../assets/svg/Tikka.svg";

import DiscordLogo from "../../assets/svg/DiscordLogo.svg";
import InstagramLogo from "../../assets/svg/InstagramLogo.svg";
import TwitterLogo from "../../assets/svg/TwitterLogo.svg";
import YoutubeLogo from "../../assets/svg/YoutubeLogo.svg";
import SubscribeForm from "../ui/SubscribeForm";
import Line from "../../assets/svg/Line";

const Footer = () => {
    return (
        <footer className="w-full bg-[#11172E] fixed-bottom">
            <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-16 py-12 md:py-16">
                {/* Top grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 text-[#CCCCCC] mb-10">
                    {/* Brand + socials */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <img
                                src={logo}
                                alt="VeriWin logo"
                                className="h-7 w-auto"
                            />
                            <img
                                src={tikka}
                                alt="VeriWin wordmark"
                                className="h-5 w-auto mt-1"
                            />
                        </div>

                        <p className="text-sm">
                            Host raffles, join raffles, and enjoy the thrill of
                            fair play—all in one simple platform.
                        </p>

                        <p className="text-sm">Join our community</p>

                        <div className="flex items-center gap-3">
                            <a href="#" aria-label="Discord">
                                <img
                                    src={DiscordLogo}
                                    alt="Discord"
                                    className="h-6 w-6"
                                />
                            </a>
                            <a href="#" aria-label="YouTube">
                                <img
                                    src={YoutubeLogo}
                                    alt="YouTube"
                                    className="h-6 w-6"
                                />
                            </a>
                            <a href="#" aria-label="Twitter / X">
                                <img
                                    src={TwitterLogo}
                                    alt="Twitter / X"
                                    className="h-6 w-6"
                                />
                            </a>
                            <a href="#" aria-label="Instagram">
                                <img
                                    src={InstagramLogo}
                                    alt="Instagram"
                                    className="h-6 w-6"
                                />
                            </a>
                        </div>
                    </div>

                    {/* Explore */}
                    <nav aria-label="Explore">
                        <h2 className="text-white text-lg md:text-[22px] font-bold mb-4">
                            Explore
                        </h2>
                        <ul className="flex flex-col gap-3">
                            <li>
                                <a href="#" className="hover:text-white">
                                    Marketplace
                                </a>
                            </li>
                            <li>
                                <a href="#" className="hover:text-white">
                                    Rankings
                                </a>
                            </li>
                            <li>
                                <a href="#" className="hover:text-white">
                                    Demo mode
                                </a>
                            </li>
                        </ul>
                    </nav>

                    {/* Resources */}
                    <nav aria-label="Resources">
                        <h2 className="text-white text-lg md:text-[22px] font-bold mb-4">
                            Resources
                        </h2>
                        <ul className="flex flex-col gap-3">
                            <li>
                                <a href="#" className="hover:text-white">
                                    Documentation
                                </a>
                            </li>
                            <li>
                                <a href="#" className="hover:text-white">
                                    Platform updates
                                </a>
                            </li>
                            <li>
                                <a href="#" className="hover:text-white">
                                    Community
                                </a>
                            </li>
                        </ul>
                    </nav>

                    {/* Digest */}
                    <div className="space-y-6">
                        <h2 className="text-white text-lg md:text-[22px] font-bold">
                            Join Our Weekly Digest
                        </h2>
                        <p className="text-sm max-w-md">
                            Get exclusive promotions & updates straight to your
                            inbox.
                        </p>
                        <div className="max-w-md">
                            <SubscribeForm />
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <Line />

                {/* Bottom bar */}
                <div className="mt-6 flex flex-wrap items-center gap-x-3 md:gap-x-6 gap-y-2 text-xs">
                    <span className="text-[#5A5E6E]">Ⓒ Tikka.</span>
                    <span className="text-[#5A5E6E]">All rights reserved.</span>

                    <a href="#" className="hover:text-white">
                        Terms of Service
                    </a>
                    <a href="#" className="hover:text-white">
                        Privacy Policy
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
