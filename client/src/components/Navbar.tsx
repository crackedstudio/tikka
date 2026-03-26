import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import logo from "../assets/svg/logo.svg";
import tikka from "../assets/svg/Tikka.svg";
import WalletButton from "./WalletButton";
import SignInButton from "./SignInButton";
import { Search } from "lucide-react";
import { useWalletContext } from "../providers/WalletProvider";
import { STELLAR_CONFIG } from "../config/stellar";

const Navbar = ({ onStart }: { onStart?: () => void }) => {
    const [open, setOpen] = React.useState(false);
    const { isConnected, isWrongNetwork, switchNetwork } = useWalletContext();
    
    const location = useLocation();
    const navigate = useNavigate();

    const [searchParams] = useSearchParams();
    const [searchValue, setSearchValue] = useState(searchParams.get("q") || "");

   useEffect(() => {
    const delayDebounce = setTimeout(() => {
        if (searchValue === "") {
            if (location.pathname === "/search") {
                navigate("/home");
            }
            return;
        }

        // Only search if we aren't on a details or create page
        const forbiddenPages = ["/details", "/create", "/leaderboard", "/my-raffles"];
        if (searchValue.trim() && !forbiddenPages.includes(location.pathname)) {
            navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
        }
    }, 400);

    return () => clearTimeout(delayDebounce);
}, [searchValue, navigate, location.pathname]);


useEffect(() => {
    const searchRelatedPages = ["/home", "/search"];
    if (!searchRelatedPages.includes(location.pathname)) {
        setSearchValue(""); // Clear the input field text
    }
}, [location.pathname]);
    
    const navItems = [
        { label: "Discover Raffles", href: "/home" },
        { label: "Create Raffle", href: "/create" },
        { label: "My Raffles", href: "/my-raffles" },
        { label: "Leaderboard", href: "/leaderboard" },
        { label: "Settings", href: "/settings" },
    ];

    const targetNetwork = STELLAR_CONFIG.network.charAt(0).toUpperCase() + STELLAR_CONFIG.network.slice(1);

    return (
        <header className="w-full fixed-top z-50 bg-[#0B0F1C]/40 backdrop-blur-md">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
                {/* Left: brand */}
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-3">
                        <img src={logo} alt="logo" className="h-7 w-auto" />
                        <img src={tikka} alt="tikka" className="h-5 w-auto mt-1" />
                    </Link>

                    {/* Desktop Search Bar - Integrated into Brand area */}
                    <div className="hidden md:block w-64 lg:w-100">
                        <div className="relative rounded-2xl bg-[#071022] border border-[#1B2433]">
                            <input
                                type="text"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                placeholder="Search raffles..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FE3796] transition-all"
                            />
                             <Search
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white"
                            />
                        </div>
                        
                    </div>
                </div>

                {/* Desktop nav */}
                <div className="hidden items-center gap-2 lg:flex">
                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            to={item.href}
                            className="px-4 py-2 text-sm text-white/80 hover:text-white transition"
                        >
                            {item.label}
                        </Link>
                    ))}

                    {isConnected && (
                        <div className="flex items-center gap-2 mr-2">
                            {isWrongNetwork ? (
                                <button
                                    onClick={() => switchNetwork()}
                                    className="flex items-center gap-2 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
                                >
                                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    Switch to {targetNetwork}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 rounded-full border border-[#52E5A4]/30 bg-[#52E5A4]/5 px-3 py-1.5 text-xs font-medium text-[#52E5A4]">
                                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#52E5A4]" />
                                    {targetNetwork}
                                </div>
                            )}
                        </div>
                    )}

                    <WalletButton />
                    <SignInButton />
                </div>

                {/* Mobile: hamburger */}
                <button
                    type="button"
                    onClick={() => setOpen((s: boolean) => !s)}
                    className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40 text-white"
                >
                    {!open ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    )}
                </button>
            </nav>

            {/* Mobile panel */}
            <div
                className={`lg:hidden overflow-hidden transition-[max-height,opacity] duration-300 bg-[#0B0F1C] ${
                    open ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
                }`}
            >
                <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 pb-4 md:px-8">
                    {/* Mobile Search */}
                    <div className="py-4">
                        <input
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Search raffles..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none"
                        />
                    </div>

                    {navItems.map((item) => (
                        <Link
                            key={item.label}
                            to={item.href}
                            className="rounded-lg px-3 py-3 text-sm text-white/90 hover:bg-white/5"
                            onClick={() => setOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}

                    <a
                        onClick={() => {
                            setOpen(false);
                            if (onStart) onStart();
                        }}
                        className="mt-2 rounded-xl px-6 py-3 text-center text-sm font-medium text-white hover:brightness-110 bg-[#FE3796] cursor-pointer"
                    >
                        Get Started
                    </a>
                </div>
            </div>
        </header>
    );
};

export default Navbar;