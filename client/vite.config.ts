import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const analyze = process.env.ANALYZE === "1";

// Resolve @tikka/sdk straight to its source entry. The SDK's dist/ is never
// built in client CI and its package.json exports point only at dist, so we
// bypass the workspace symlink and bundle the SDK TypeScript in with the app.
const sdkLightSource = fileURLToPath(
    new URL("../sdk/src/index.light.ts", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        analyze &&
            visualizer({
                filename: "dist/stats.html",
                gzipSize: true,
                brotliSize: true,
                template: "treemap",
                open: false,
            }),
        VitePWA({
            registerType: "prompt",
            includeAssets: ["favicon-32x32.png", "apple-touch-icon.png", "offline.html"],
            manifest: {
                name: "Tikka",
                short_name: "Tikka",
                description: "Decentralized Raffles on Stellar",
                theme_color: "#000000",
                background_color: "#000000",
                display: "standalone",
                icons: [
                    {
                        src: "icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "icon-maskable-192.png",
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "maskable",
                    },
                    {
                        src: "icon-maskable-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
                navigateFallback: "/offline.html",
                runtimeCaching: [
                    {
                        // Navigation requests (HTML documents) — NetworkFirst
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "pages-cache",
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 24 * 60 * 60,
                            },
                        },
                    },
                    {
                        // API calls — NetworkFirst
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "api-cache",
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 5 * 60,
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        // Raffles data — NetworkFirst
                        urlPattern: ({ url }) => url.pathname.includes('/raffles'),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "raffles-cache",
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 5 * 60,
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                ],
            },
        }),
    ].filter(Boolean),
    resolve: {
        alias: [
            {
                // Match @tikka/sdk and @tikka/sdk/<subpath>; both map to the
                // light source entry since it is the browser-safe surface.
                find: /^@tikka\/sdk(\/.*)?$/,
                replacement: sdkLightSource,
            },
        ],
    },
    define: {
        global: "globalThis",
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: "globalThis",
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules/@stellar/")) return "stellar-sdk";
                    if (id.includes("node_modules/@creit.tech/stellar-wallets-kit")) return "stellar-wallets-kit";
                    if (
                        id.includes("node_modules/react") ||
                        id.includes("node_modules/react-dom") ||
                        id.includes("node_modules/react-router")
                    ) {
                        return "react-vendor";
                    }
                    if (id.includes("node_modules")) return "vendor";
                },
            },
        },
    },
});
