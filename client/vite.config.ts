import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";

const analyze = process.env.ANALYZE === "1";

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
            includeAssets: ["vite.svg", "offline.html"],
            manifest: {
                name: "Tikka",
                short_name: "Tikka",
                description: "Tikka Application",
                theme_color: "#ffffff",
                background_color: "#ffffff",
                display: "standalone",
                icons: [
                    {
                        src: "vite.svg",
                        sizes: "192x192",
                        type: "image/svg+xml",
                    },
                    {
                        src: "vite.svg",
                        sizes: "512x512",
                        type: "image/svg+xml",
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
});
