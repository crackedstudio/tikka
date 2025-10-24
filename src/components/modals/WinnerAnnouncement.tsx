import React from "react";
import { X } from "lucide-react";
import type {
    WinnerAnnouncementProps,
    SocialPlatform,
} from "../../types/types";

const WinnerAnnouncement: React.FC<WinnerAnnouncementProps> = ({
    onClose,
    onClaimPrize,
    onBackToHome,
    prizeName = "Lamborghini Aventador, Limited Edition 2023",
    prizeValue = "$500,000",
    walletAddress = "0x330cd8fec...8b7c",
    isVisible = true,
}) => {
    if (!isVisible) return null;

    const socialPlatforms: SocialPlatform[] = [
        {
            id: "twitter",
            name: "Twitter",
            icon: "twitter",
            color: "bg-blue-400",
            url: "https://twitter.com/intent/tweet",
        },
        {
            id: "facebook",
            name: "Facebook",
            icon: "facebook",
            color: "bg-blue-600",
            url: "https://www.facebook.com/sharer/sharer.php",
        },
        {
            id: "whatsapp",
            name: "WhatsApp",
            icon: "whatsapp",
            color: "bg-green-500",
            url: "https://wa.me/",
        },
        {
            id: "telegram",
            name: "Telegram",
            icon: "telegram",
            color: "bg-blue-400",
            url: "https://t.me/share/url",
        },
    ];

    const getSocialIcon = (platform: string) => {
        switch (platform) {
            case "twitter":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                    </svg>
                );
            case "facebook":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                );
            case "whatsapp":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                    </svg>
                );
            case "telegram":
                return (
                    <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                );
            default:
                return null;
        }
    };

    const handleSocialShare = (platform: SocialPlatform) => {
        const text = `I just won ${prizeName} worth ${prizeValue} on Tikka! 🎉`;
        const url = encodeURIComponent(window.location.href);
        const shareText = encodeURIComponent(text);

        let shareUrl = "";
        switch (platform.id) {
            case "twitter":
                shareUrl = `${platform.url}?text=${shareText}&url=${url}`;
                break;
            case "facebook":
                shareUrl = `${platform.url}?u=${url}`;
                break;
            case "whatsapp":
                shareUrl = `${platform.url}?text=${shareText}%20${url}`;
                break;
            case "telegram":
                shareUrl = `${platform.url}?url=${url}&text=${shareText}`;
                break;
        }

        window.open(shareUrl, "_blank", "width=600,height=400");
    };

    return (
        <div className="w-full max-w-[500px] mx-auto px-4 sm:px-6">
            {/* Close Button */}
            <div className="flex justify-end mb-4 sm:mb-6">
                <button
                    onClick={onClose}
                    className="text-white hover:text-gray-300 transition-colors"
                    aria-label="Close modal"
                >
                    <X size={20} className="sm:w-6 sm:h-6" />
                </button>
            </div>

            {/* Main Content */}
            <div className="bg-[#1E1932] rounded-xl p-6 sm:p-8">
                {/* Title */}
                <div className="text-center mb-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        You Won!
                    </h2>
                    <p className="text-white text-sm sm:text-base">
                        {prizeName}
                    </p>
                </div>

                {/* Prize Value */}
                <div className="text-center mb-6">
                    <span className="text-white text-sm">Valued at</span>
                    <div className="text-yellow-400 text-xl sm:text-2xl font-bold">
                        {prizeValue}
                    </div>
                </div>

                {/* Claim Instructions */}
                <div className="mb-6">
                    <div className="flex items-start space-x-3 mb-3">
                        <div className="w-6 h-6 bg-blue-400 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-sm font-bold">
                                i
                            </span>
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-sm sm:text-base">
                                Claim Instructions
                            </h3>
                            <p className="text-white text-xs sm:text-sm mt-1">
                                Your prize will be transferred to your connected
                                wallet address. Please verify your details
                                below.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Wallet Details */}
                <div className="bg-[#2A264A] rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            {/* Metamask Logo */}
                            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                                <svg
                                    className="w-6 h-6 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                            </div>
                            <div>
                                <div className="text-white font-medium text-sm">
                                    {walletAddress}
                                </div>
                                <div className="text-gray-400 text-xs">
                                    Metamask
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-xs font-medium mb-1">
                                Connected
                            </div>
                            <button className="text-white text-xs hover:text-gray-300 transition-colors">
                                Change
                            </button>
                        </div>
                    </div>
                </div>

                {/* Claim Button */}
                <div className="mb-8">
                    <button
                        onClick={onClaimPrize}
                        className="w-full bg-[#FF389C] hover:bg-[#FF389C]/90 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
                    >
                        Claim Your Prize
                    </button>
                </div>
            </div>

            {/* Social Sharing */}
            <div className="text-center mt-8">
                <h3 className="text-white font-bold text-lg mb-4">
                    Share Your Victory!
                </h3>
                <div className="flex justify-center space-x-4">
                    {socialPlatforms.map((platform) => (
                        <button
                            key={platform.id}
                            onClick={() => handleSocialShare(platform)}
                            className={`w-12 h-12 ${platform.color} rounded-full flex items-center justify-center text-white hover:opacity-80 transition-opacity duration-200`}
                            aria-label={`Share on ${platform.name}`}
                        >
                            {getSocialIcon(platform.icon)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Back to Home */}
            <div className="text-center mt-8">
                <button
                    onClick={onBackToHome}
                    className="bg-[#2A264A] hover:bg-[#3A365A] text-white px-6 py-3 rounded-lg flex items-center space-x-2 mx-auto transition-colors duration-200"
                >
                    <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                    <span>Back to Home</span>
                </button>
            </div>
        </div>
    );
};

export default WinnerAnnouncement;
