import React from "react";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { baseSepolia } from "wagmi/chains";
import { WagmiProvider } from "wagmi";
import { config } from "../config/wagmi";

interface OnchainKitProviderWrapperProps {
    children: React.ReactNode;
}

const OnchainKitProviderWrapper: React.FC<OnchainKitProviderWrapperProps> = ({
    children,
}) => {
    console.log(
        "🔍 OnchainKit Provider - API Key:",
        import.meta.env.VITE_ONCHAINKIT_API_KEY
    );
    console.log("🔍 OnchainKit Provider - Chain:", baseSepolia);
    console.log("🔍 OnchainKit Provider - Chain ID:", baseSepolia.id);
    console.log("🔍 OnchainKit Provider - Chain Name:", baseSepolia.name);

    return (
        <WagmiProvider config={config}>
            <OnchainKitProvider
                apiKey={
                    import.meta.env.VITE_ONCHAINKIT_API_KEY ||
                    "your_api_key_here"
                }
                chain={baseSepolia}
                config={{
                    appearance: {
                        mode: "dark", // Match the app's dark theme
                    },
                    wallet: {
                        display: "modal",
                        preference: "all",
                    },
                }}
            >
                {children}
            </OnchainKitProvider>
        </WagmiProvider>
    );
};

export default OnchainKitProviderWrapper;
