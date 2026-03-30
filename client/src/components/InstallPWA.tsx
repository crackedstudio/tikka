import React, { useEffect, useState } from "react";

// The BeforeInstallPromptEvent is not included in standard TS DOM lib
interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function InstallPWA() {
    const [supportsPWA, setSupportsPWA] = useState(false);
    const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setPromptInstall(e as BeforeInstallPromptEvent);
            // Update UI notify the user they can install the PWA
            setSupportsPWA(true);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Optional: listen for successful install
        const appInstalledHandler = () => {
            setSupportsPWA(false);
            setPromptInstall(null);
            console.log("PWA was installed");
        };
        window.addEventListener("appinstalled", appInstalledHandler);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            window.removeEventListener("appinstalled", appInstalledHandler);
        };
    }, []);

    const onClick = async (evt: React.MouseEvent<HTMLButtonElement>) => {
        evt.preventDefault();
        if (!promptInstall) {
            return;
        }
        
        // Show the install prompt
        promptInstall.prompt();
        
        // Wait for the user to respond to the prompt
        const choiceResult = await promptInstall.userChoice;
        if (choiceResult.outcome === "accepted") {
            console.log("User accepted the install prompt");
        } else {
            console.log("User dismissed the install prompt");
        }
        
        // We no longer need the prompt. Clear it up.
        setPromptInstall(null);
        setSupportsPWA(false);
    };

    if (!supportsPWA) {
        return null; // Don't render if not supported or already installed/dismissed
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[100] p-4 bg-white dark:bg-zinc-800 rounded-xl shadow-xl flex items-center justify-between border border-zinc-200 dark:border-zinc-700 animate-in slide-in-from-bottom-5">
            <div className="flex-1 mr-4">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Install Tikka</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Add to your home screen for quick access</p>
            </div>
            <div className="flex gap-2 shrink-0">
                <button
                    className="p-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                    onClick={() => setSupportsPWA(false)}
                    aria-label="Dismiss"
                >
                    Later
                </button>
                <button
                    className="px-4 py-2 bg-green-500 text-gray-900 dark:text-white text-sm font-medium rounded-lg shadow-sm hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800 transition-colors"
                    onClick={onClick}
                >
                    Install App
                </button>
            </div>
        </div>
    );
}
