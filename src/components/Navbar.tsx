// Navbar.tsx
import React from "react";
import logo from "../assets/svg/logo.svg";
import tikka from "../assets/svg/Tikka.svg";

const Navbar = ({ onStart }: { onStart: () => void }) => {
    const [open, setOpen] = React.useState(false);

    const navItems = [
        { label: "Discover Raffles", href: "#" },
        { label: "Create Raffle", href: "#" },
    ];

    return (
        <header className="w-full fixed-top">
            <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
                {/* Left: brand */}
                <a href="#" className="flex items-center gap-3">
                    <img src={logo} alt="logo" className="h-7 w-auto" />
                    <img src={tikka} alt="tikka" className="h-5 w-auto mt-1" />
                </a>

                {/* Desktop nav */}
                <div className="hidden items-center gap-2 lg:flex">
                    {navItems.map((item) => (
                        <a
                            key={item.label}
                            href={item.href}
                            className="px-4 py-2 text-sm text-white/80 hover:text-white transition"
                        >
                            {item.label}
                        </a>
                    ))}

                    <button
                        onClick={onStart}
                        className="ml-2 rounded-xl px-6 py-3 text-sm font-medium text-white transition hover:brightness-110 bg-[#FE3796]"
                    >
                        Get Started
                    </button>
                </div>

                {/* Mobile: hamburger */}
                <button
                    type="button"
                    onClick={() => setOpen((s) => !s)}
                    className="lg:hidden inline-flex items-center justify-center rounded-lg p-2 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/40"
                    aria-controls="mobile-menu"
                    aria-expanded={open}
                    aria-label="Toggle menu"
                >
                    {/* Icon */}
                    {!open ? (
                        /* Hamburger */
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <path
                                d="M4 7h16M4 12h16M4 17h16"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    ) : (
                        /* Close */
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <path
                                d="M6 6l12 12M18 6l-12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    )}
                </button>
            </nav>

            {/* Mobile panel */}
            <div
                id="mobile-menu"
                className={`lg:hidden overflow-hidden transition-[max-height,opacity] duration-300 ${
                    open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                }`}
            >
                <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 pb-4 md:px-8">
                    {navItems.map((item) => (
                        <a
                            key={item.label}
                            href={item.href}
                            className="rounded-lg px-3 py-3 text-sm text-white/90 hover:bg-white/5"
                            onClick={() => setOpen(false)}
                        >
                            {item.label}
                        </a>
                    ))}

                    <a
                        onClick={() => {
                            setOpen(false);
                            onStart();
                        }}
                        className="mt-2 rounded-xl px-6 py-3 text-center text-sm font-medium text-white hover:brightness-110 bg-[#FE3796]"
                    >
                        Get Started
                    </a>
                </div>
            </div>
        </header>
    );
};

export default Navbar;
