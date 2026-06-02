/**
 * AppProviders
 *
 * Centralized composition of all application-wide providers.
 *
 * Provider Order (outer to inner):
 * 1. HelmetProvider   - Document head management (SEO, meta tags)
 * 2. BrowserRouter   - Routing context
 * 3. WalletProvider   - Wallet connection state (no dependencies)
 * 4. AuthProvider     - Auth state (depends on WalletProvider)
 * 5. Toaster           - Notification toast system
 *
 * Notes:
 * - i18n is initialized in src/i18n.ts and uses react-i18next's initReactI18next
 *   under the hood, so no explicit I18nextProvider wrapper is needed.
 * - Theme is handled via Tailwind CSS dark mode class manipulation in main.tsx,
 *   not a React context provider.
 * - Notification preferences are managed via useNotifications hook, no provider needed.
 */

import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { WalletProvider } from "./WalletProvider";
import { AuthProvider } from "./AuthProvider";
import { Toaster } from "sonner";

interface AppProvidersProps {
    children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
    return (
        <HelmetProvider>
            <BrowserRouter>
                <WalletProvider>
                    <AuthProvider>
                        <Toaster
                            richColors
                            position="bottom-right"
                            closeButton
                            theme="system"
                        />
                        {children}
                    </AuthProvider>
                </WalletProvider>
            </BrowserRouter>
        </HelmetProvider>
    );
}