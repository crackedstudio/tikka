import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// Custom RPC URL for faster blockchain data fetching
const INFURA_RPC_URL =
    import.meta.env.VITE_INFURA_RPC_URL ||
    "https://base-sepolia.infura.io/v3/2DmS9CrnVeU2Caun612yGaPQ2aq";

// Create wagmi configuration with custom RPC
export const config = createConfig({
    chains: [baseSepolia],
    connectors: [
        injected(),
        coinbaseWallet({
            appName: "Tikka",
            appLogoUrl: "https://tikka.com/logo.png",
        }),
        walletConnect({
            projectId:
                import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
                "your_project_id",
        }),
    ],
    transports: {
        [baseSepolia.id]: http(INFURA_RPC_URL, {
            // Configure the transport for better performance
            batch: true, // Enable request batching
            retryCount: 3, // Retry failed requests
            retryDelay: 1000, // Delay between retries
            timeout: 10000, // Request timeout
        }),
    },
    ssr: false, // Disable SSR for better client-side performance
});

console.log("🔍 Wagmi Config - Using custom RPC URL:", INFURA_RPC_URL);
console.log("🔍 Wagmi Config - Chain:", baseSepolia.name);
console.log("🔍 Wagmi Config - Chain ID:", baseSepolia.id);
