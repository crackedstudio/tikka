import { Networks } from "@stellar/stellar-sdk";

export const STELLAR_CONFIG = {
  network: import.meta.env.VITE_STELLAR_NETWORK || "testnet",
  rpcUrl:
    import.meta.env.VITE_SOROBAN_RPC_URL ||
    "https://soroban-testnet.albedo.link:443",
  horizonUrl:
    import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org",
  networkPassphrase:
    import.meta.env.VITE_STELLAR_NETWORK === "mainnet"
      ? Networks.PUBLIC
      : Networks.TESTNET,
};

console.log("Current Network Config:", {
  network: import.meta.env.VITE_STELLAR_NETWORK,
  rpc: import.meta.env.VITE_SOROBAN_RPC_URL,
});

// Simple validation to ensure we don't boot with broken config
if (!STELLAR_CONFIG.rpcUrl) {
  throw new Error("Missing Soroban RPC URL in environment variables.");
}
