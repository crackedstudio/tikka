import React, { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import RaffleWinnerBanner from "../components/RaffleWinnerBanner";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const prizeName = "Lamborghini Aventador, Limited Edition 2023";
const prizeValue = "$500,000";
const walletAddress = "0x330cd8fec9c4e5b87c1d4f6a9b2e8c7f";

const WinnerDemo: React.FC = () => {
    const [revealedAddress, setRevealedAddress] = useState("");

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;

        if (prefersReducedMotion) {
            setRevealedAddress(walletAddress);
            return;
        }

        confetti({
            particleCount: 120,
            spread: 90,
            startVelocity: 42,
            origin: { y: 0.65 },
        });

        let index = 0;
        const interval = window.setInterval(() => {
            index += 1;
            setRevealedAddress(walletAddress.slice(0, index));

            if (index >= walletAddress.length) {
                window.clearInterval(interval);
            }
        }, 55);

        return () => window.clearInterval(interval);
    }, []);

    const buildShareMessage = () =>
        `I just won ${prizeName} worth ${prizeValue} on Tikka! 🎉`;

    const shareLinks = [
        {
            label: "Share on X",
            href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                buildShareMessage()
            )}&url=${encodeURIComponent(window.location.href)}`,
        },
        {
            label: "Share on Telegram",
            href: `https://t.me/share/url?url=${encodeURIComponent(
                window.location.href
            )}&text=${encodeURIComponent(buildShareMessage())}`,
        },
    ];

    const prettyAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`;
    const animatedAddress =
        revealedAddress.length >= walletAddress.length
            ? walletAddress
            : `${revealedAddress}${"•".repeat(
                  Math.max(walletAddress.length - revealedAddress.length, 0)
              )}`;

    return (
        <div className="min-h-screen bg-[#0B1020] text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,56,156,0.22),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.22),_transparent_36%)]" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

            <div className="relative w-full max-w-7xl mx-auto px-6 py-8">
                <Breadcrumbs />
            </div>

            <main className="relative w-full max-w-5xl mx-auto px-6 pb-16 pt-6 lg:pt-10">
                <div className="mb-8">
                    <RaffleWinnerBanner
                        isWinner
                        prizeName={prizeName}
                        prizeValue={prizeValue}
                        walletAddress={walletAddress}
                    />
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] items-start">
                    <section className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl p-6 sm:p-8 shadow-[0_28px_100px_rgba(0,0,0,0.35)]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-3 w-3 rounded-full bg-pink-400 shadow-[0_0_18px_rgba(244,114,182,0.7)]" />
                            <p className="text-xs uppercase tracking-[0.32em] text-pink-100/70">
                                Winner reveal
                            </p>
                        </div>
                        <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
                            Winner Announcement Demo
                        </h1>
                        <p className="text-base sm:text-lg text-slate-200/85 max-w-2xl">
                            The winning wallet is revealed with a typewriter-style animation,
                            while the banner, share links, and confetti celebrate the result.
                        </p>

                        <div className="mt-8 rounded-3xl border border-white/10 bg-[#0B1020]/80 p-5 sm:p-6">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.28em] text-pink-100/60 mb-1">
                                        Winning wallet
                                    </div>
                                    <div className="text-sm text-slate-300">
                                        Full address fades in below.
                                    </div>
                                </div>
                                <div className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200">
                                    {prettyAddress}
                                </div>
                            </div>
                            <div
                                className="font-mono text-lg sm:text-2xl tracking-[0.18em] break-all text-white"
                                aria-live="polite"
                            >
                                {animatedAddress}
                            </div>
                        </div>
                    </section>

                    <aside className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl p-6 sm:p-8 shadow-[0_28px_100px_rgba(0,0,0,0.3)]">
                        <h2 className="text-xl font-bold mb-3">Share your win</h2>
                        <p className="text-sm text-slate-300 mb-5">
                            Pre-filled messages make it easy to announce the win.
                        </p>
                        <div className="space-y-3">
                            {shareLinks.map((link) => (
                                <a
                                    key={link.label}
                                    href={link.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                                >
                                    <span>{link.label}</span>
                                    <span aria-hidden="true">↗</span>
                                </a>
                            ))}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
};

export default WinnerDemo;