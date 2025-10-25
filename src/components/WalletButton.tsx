import React, { useState, useEffect, useRef } from "react";
import { ConnectWallet, Wallet } from "@coinbase/onchainkit/wallet";
import { useAccount, useDisconnect } from "wagmi";

const WalletButton: React.FC = () => {
    const { isConnected, address } = useAccount();
    const { disconnect } = useDisconnect();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setShowDropdown(false);
            }
        };

        if (showDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showDropdown]);

    if (!isConnected) {
        return <ConnectWallet />;
    }

    const handleDisconnect = () => {
        console.log("🔍 WalletButton - Disconnecting wallet...");
        disconnect();
        setShowDropdown(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <Wallet>
                <div
                    className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setShowDropdown(!showDropdown)}
                >
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                                />
                            </svg>
                        </div>
                        <div className="text-white text-sm font-medium">
                            {address
                                ? `${address.slice(0, 6)}...${address.slice(
                                      -4
                                  )}`
                                : "Connected"}
                        </div>
                    </div>
                    {/* Dropdown arrow */}
                    <svg
                        className={`w-4 h-4 text-white transition-transform ${
                            showDropdown ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </Wallet>

            {/* Custom dropdown menu */}
            {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1E1932] rounded-lg shadow-lg border border-[#2A264A] z-50">
                    <div className="py-2">
                        {/* Account info */}
                        <div className="px-4 py-3 border-b border-[#2A264A]">
                            <div className="text-sm text-gray-300">
                                Connected Account
                            </div>
                            <div className="text-sm font-medium text-white mt-1">
                                {address
                                    ? `${address.slice(0, 6)}...${address.slice(
                                          -4
                                      )}`
                                    : "Unknown"}
                            </div>
                        </div>

                        {/* Disconnect button */}
                        <button
                            onClick={handleDisconnect}
                            className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-400/10 transition-colors flex items-center space-x-2"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                />
                            </svg>
                            <span>Disconnect</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WalletButton;
