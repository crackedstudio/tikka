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
        <div className="bg-[#11172E] px-22 py-28 fixed-bottom">
            <div className="flex justify-between text-[#CCCCCC] my-8">
                <div className="space-y-8 w-[30%]">
                    <div className="flex items-center space-x-3">
                        <img src={logo} alt="logo" />
                        <img src={tikka} alt="tikka" className="mt-2" />
                    </div>
                    <p>
                        Host raffles, join raffles, and enjoy the thrill of fair
                        play—all in one simple platform.
                    </p>
                    <p>Join our community</p>
                    <div className="flex space-x-2">
                        <img src={DiscordLogo} alt="" />
                        <img src={YoutubeLogo} alt="" />
                        <img src={TwitterLogo} alt="" />
                        <img src={InstagramLogo} alt="" />
                    </div>
                </div>
                <div>
                    <h1 className="text-white text-[22px] font-bold mb-6">
                        Explore
                    </h1>
                    <div className="flex flex-col space-y-5">
                        <p>Marketplace</p>
                        <p>Rankings</p>
                        <p>Connect a wallet</p>
                    </div>
                </div>
                <div>
                    <h1 className="text-white text-[22px] font-bold mb-6">
                        Resources
                    </h1>
                    <div className="flex flex-col space-y-5">
                        <p>Documentation</p>
                        <p>Smart Contracts</p>
                        <p>Community</p>
                    </div>
                </div>
                <div className="space-y-8">
                    <h1 className="text-white text-[22px] font-bold mb-6">
                        Join Our Weekly Digest
                    </h1>
                    <p className="w-[80%]">
                        Get exclusive promotions & updates straight to your
                        inbox.
                    </p>
                    <SubscribeForm />
                </div>
            </div>
            <Line />
            <div className="flex space-x-8 mt-8">
                <p className="text-[#5A5E6E] text-xs">Ⓒ Tikka.</p>
                <p className="text-[#5A5E6E] text-xs">All rights reserved.</p>
                <p className="text-xs">Terms of Service</p>
                <p className="text-xs">Privacy Policy</p>
            </div>
        </div>
    );
};

export default Footer;
