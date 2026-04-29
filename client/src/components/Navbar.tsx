import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLocation } from "react-router-dom";
import logo from "../assets/svg/logo.svg";
import tikka from "../assets/svg/Tikka.svg";
import WalletButton from "./WalletButton";
import ThemeToggle from "./ThemeToggle";
import SignInButton from "./SignInButton";
import { Search } from "lucide-react";
import { useWalletContext } from "../providers/WalletProvider";
import { STELLAR_CONFIG } from "../config/stellar";
import { useTranslation } from "react-i18next";


const Navbar = ({ onStart }: { onStart?: () => void }) => {
    const { t, i18n } = useTranslation();
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

            // Only search if we aren't on detail/create pages
            const isForbiddenPage =
                location.pathname === "/details" ||
                location.pathname.startsWith("/raffles/") ||
                location.pathname === "/create" ||
                location.pathname === "/leaderboard" ||
                location.pathname === "/my-raffles";
            if (searchValue.trim() && !isForbiddenPage) {
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
        { label: t("navbar.discover"), href: "/home" },
        { label: t("navbar.create"), href: "/create" },
        { label: t("navbar.myRaffles"), href: "/my-raffles" },
        { label: t("navbar.leaderboard"), href: "/leaderboard" },
        { label: t("navbar.settings"), href: "/settings" },
    ];

    const targetNetwork = STELLAR_CONFIG.network.charAt(0).toUpperCase() + STELLAR_CONFIG.network.slice(1);

    return (
        <header className="w-full fixed-top z-50 bg-white/40 dark:bg-[#0B0F1C]/40 backdrop-blur-md transition-colors duration-300">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
                {/* Left: brand */}
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-3">
                        <img src={logo} alt="logo" className="h-7 w-auto invert dark:invert-0" />
                        <img src={tikka} alt="tikka" className="h-5 w-auto mt-1 invert dark:invert-0" />
                    </Link>

                    {/* Desktop Search Bar - Integrated into Brand area */}
                    <div className="hidden md:block w-64 lg:w-100">
                        <div className="relative rounded-2xl bg-[#071022] border border-[#1B2433]">
                            <input
                                type="text"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                placeholder={t("navbar.searchPlaceholder")}
                                className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-600 dark:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FE3796] transition-all"
                            />
                            <Search
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-900 dark:text-white"
                            />
                        </div>

                    </div>
                </div>

                {/* Desktop nav */}
                <div className="hidden items-center gap-2 lg:flex">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.label}
                                to={item.href}
                                className={`px-4 py-2 text-sm text-gray-600 dark:transition ${isActive
                                        ? "text-white font-semibold"
                                        : "text-white/80 hover:text-gray-900 dark:text-white"
                                    }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}

                    {isConnected && (
                        <div className="flex items-center gap-2 mr-2">
                            {isWrongNetwork ? (
                                <button
                                    onClick={() => switchNetwork()}
                                    className="flex items-center gap-2 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
                                >
                                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                    {t("navbar.switchTo", { network: targetNetwork })}
                                </button>
                            ) : (
                                <div className="flex items-center gap-2 rounded-full border border-[#52E5A4]/30 bg-[#52E5A4]/5 px-3 py-1.5 text-xs font-medium text-[#52E5A4]">
                                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#52E5A4]" />
                                    {targetNetwork}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5">
                        <button
                            onClick={() => i18n.changeLanguage("en")}
                            className={`px-2 py-1 text-xs font-medium rounded ${i18n.language === "en" ? "bg-[#FE3796] text-white" : "text-gray-500 hover:text-gray-900 dark:text-white/60"}`}
                        >
                            EN
                        </button>
                        <button
                            onClick={() => i18n.changeLanguage("es")}
                            className={`px-2 py-1 text-xs font-medium rounded ${i18n.language === "es" ? "bg-[#FE3796] text-white" : "text-gray-500 hover:text-gray-900 dark:text-white/60"}`}
                        >
                            ES
                        </button>
                    </div>

                    <ThemeToggle />
                    <WalletButton />
                    <SignInButton />
                </div>

                {/* Mobile: hamburger */}
                <div className="flex gap-4">
                    <button
                        type="button"
                        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
                        onClick={() => setOpen((s: boolean) => !s)}
                        className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 hover:bg-gray-200 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40 text-gray-900 dark:text-white"
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
                </div>

            </nav>

            {/* Mobile panel */}
            <div
                data-testid="mobile-nav-panel"
                className={`lg:hidden overflow-hidden transition-[max-height,opacity,background-color] duration-300 bg-gray-50 dark:bg-[#0B0F1C] ${open ? "max-h-screen opacity-100" : "max-h-0 opacity-0"
                    }`}
            >
                <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 pb-4 md:px-8">
                    {/* Mobile Search */}
                    <div className="py-4">
                        <input
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder={t("navbar.searchPlaceholder")}
                            className="w-full bg-gray-200 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-600 dark:text-white/40 focus:outline-none"
                        />
                    </div>

                    {navItems.map((item) => {
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.label}
                                to={item.href}
                                className={`rounded-lg px-3 py-3 text-sm transition ${isActive
                                        ? "text-white font-semibold bg-white/10"
                                        : "text-gray-600 dark:text-white/90 hover:bg-gray-200 dark:bg-white/5"
                                    }`}
                                onClick={() => setOpen(false)}
                            >
                                {item.label}
                            </Link>
                        );
                    })}

                    <a
                        onClick={() => {
                            setOpen(false);
                            if (onStart) onStart();
                        }}
                        className="mt-2 rounded-xl px-6 py-3 text-center text-sm font-medium text-gray-900 dark:text-white hover:brightness-110 bg-[#FE3796] cursor-pointer"
                    >
                        {t("navbar.getStarted")}
                    </a>
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
};

export default Navbar;