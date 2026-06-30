import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark" | "system">(
        (localStorage.getItem("tikka-theme") as "light" | "dark") || "system"
    );

    useEffect(() => {
        const root = document.documentElement;

        if (theme === "dark") {
            root.classList.add("dark");
            localStorage.setItem("tikka-theme", "dark");
        } else if (theme === "light") {
            root.classList.remove("dark");
            localStorage.setItem("tikka-theme", "light");
        } else {
            // Respect OS preference (remove explicit choice)
            localStorage.removeItem("tikka-theme");
            root.classList.toggle(
                "dark",
                window.matchMedia("(prefers-color-scheme: dark)").matches
            );
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => {
            if (prev === "system") {
                return window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
            }
            return prev === "dark" ? "light" : "dark";
        });
    };

    return (
        <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-icon transition hover:bg-surface-hover hover:text-icon-hover"
            aria-label="Toggle theme"
            title={`Current theme: ${theme}`}
        >
            {(theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) ? (
                <Moon size={18} />
            ) : (
                <Sun size={18} />
            )}
        </button>
    );
}
