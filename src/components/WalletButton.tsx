import React from "react";

const WalletButton: React.FC = () => {
    return (
        <div className="flex items-center gap-2 rounded-full border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-white">
            <span className="inline-flex h-2 w-2 rounded-full bg-[#52E5A4]" />
            Demo Mode
        </div>
    );
};

export default WalletButton;
