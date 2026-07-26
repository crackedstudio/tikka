import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useWalletContext } from "../providers/WalletProvider";
import { useRaffle } from "./useRaffles";

export const useRaffleDetailsData = (raffleId: number) => {
    const { address } = useWalletContext();
    const hasCelebrated = useRef(false);
    const { raffle, error, isLoading, refetch } = useRaffle(raffleId);

    // Setup window focus refetch
    useEffect(() => {
        const handleFocus = () => refetch();
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [refetch]);

    // Handle winner celebration
    useEffect(() => {
        if (raffle?.winner && address === raffle.winner && !hasCelebrated.current) {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

            const randomInRange = (min: number, max: number) =>
                Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                confetti({
                    ...defaults,
                    particleCount,
                    origin: {
                        x: randomInRange(0.1, 0.3),
                        y: Math.random() - 0.2,
                    },
                });
                confetti({
                    ...defaults,
                    particleCount,
                    origin: {
                        x: randomInRange(0.7, 0.9),
                        y: Math.random() - 0.2,
                    },
                });
            }, 250);

            hasCelebrated.current = true;
        }
    }, [raffle?.winner, address]);

    return { raffle, error, isLoading, refetch };
};
