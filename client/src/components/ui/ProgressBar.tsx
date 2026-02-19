// ProgressBar.tsx
import React from "react";

type Props = {
    /** 0–100 (values outside are clamped) */
    value: number;
    /** Optional label above the bar */
    label?: string;
    /** Height of the bar (e.g., "10px", "0.75rem") */
    height?: string;
    /** Show % text inside the bar */
    showPercent?: boolean;
    /** Rounded radius (Tailwind class or CSS value if not using Tailwind) */
    roundedClass?: string;
    /** Add a subtle animated sheen over the fill */
    shimmer?: boolean;
};

export const ProgressBar: React.FC<Props> = ({
    value,
    label,
    height = "5px",
    showPercent = true,
    roundedClass = "rounded-full",
    shimmer = true,
}) => {
    const pct = Math.max(0, Math.min(100, value));

    return (
        <div className="w-full flex flex-col gap-2">
            {label && (
                <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    {showPercent && (
                        <span className="tabular-nums">{pct}%</span>
                    )}
                </div>
            )}

            <div
                className={`relative w-full bg-black/10 ${roundedClass} overflow-hidden`}
                style={{ height }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={`h-full ${roundedClass} transition-[width] duration-500 ease-out`}
                    style={{
                        width: `${pct}%`,
                        background:
                            "linear-gradient(99.31deg, #3931F9 14.85%, #FE6AB7 111.59%)",
                    }}
                />

                {shimmer && pct > 0 && (
                    <div
                        className="pointer-events-none absolute inset-y-0"
                        style={{
                            left: 0,
                            width: `${pct}%`,
                            background:
                                "linear-gradient(99.31deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.0) 100%)",
                            mixBlendMode: "overlay",
                            animation: "pb-sheen 2s linear infinite",
                            WebkitMaskImage:
                                "linear-gradient(to right, black 80%, transparent 100%)",
                            maskImage:
                                "linear-gradient(to right, black 80%, transparent 100%)",
                        }}
                    />
                )}
            </div>
        </div>
    );
};
