import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark" | "system">(
        (localStorage.getItem("theme") as "light" | "dark") || "system"
    );

    useEffect(() => {
        const root = document.documentElement;

        if (theme === "dark") {
            root.classList.add("dark");
            localStorage.theme = "dark";
        } else if (theme === "light") {
            root.classList.remove("dark");
            localStorage.theme = "light";
        } else {
            // Respect OS preference (remove explicit choice)
            localStorage.removeItem("theme");
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-800 dark:text-white/80 transition hover:bg-gray-200 dark:hover:bg-gray-300 dark:bg-white/10 hover:text-black dark:hover:text-gray-900 dark:text-white"
            aria-label="Toggle theme"
            title={`Current theme: ${theme}`}
        >
            {/* Display Moon when it resolves to Dark, Sun otherwise */}
            {(theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) ? (
                <Moon size={18} />
            ) : (
                <Sun size={18} />
            )}
        </button>
    );
}
