/**
 * AppProviders
 *
 * Centralized composition of app-wide providers.
 *
 * Provider order matters:
 * 1) WalletProvider
 *    - Must wrap AuthProvider (AuthProvider consumes wallet context).
 * 2) AuthProvider
 *    - Must wrap components that need authentication state.
 * 3) Toaster / NetworkWarning
 *    - Global UI layers; NetworkWarning consumes WalletProvider.
 * 4) Router
 *    - Routing context for the whole app.
 */

import React from "react";
import { Toaster } from "sonner";
import { BrowserRouter as Router } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

import ErrorBoundary from "../components/ui/ErrorBoundary";
import NetworkWarning from "../components/NetworkWarning";

import { WalletProvider } from "./WalletProvider";
import { AuthProvider } from "./AuthProvider";

interface AppProvidersProps {
    children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
    return (
        <HelmetProvider>
            <ErrorBoundary>
                <WalletProvider>
                    <AuthProvider>
                        <Toaster richColors position="bottom-right" closeButton theme="system" />

                        {/* Issue #120: Global Network Warning */}
                        <NetworkWarning />

                        <Router>{children}</Router>
                    </AuthProvider>
                </WalletProvider>
            </ErrorBoundary>
        </HelmetProvider>
    );
}
