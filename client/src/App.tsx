import LandingLayout from "./layouts/LandingLayout";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { STELLAR_CONFIG } from "./config/stellar";
import { checkConnection } from "./services/rpcService";
import { logger } from "./utils/logger";
import { AppProviders } from "./providers/AppProviders";
import NetworkWarning from "./components/NetworkWarning";
import { InstallPWA } from "./components/InstallPWA";
import { Spinner } from "./components/ui/Spinner";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Home = lazy(() => import("./pages/Home"));
const SearchPage = lazy(() => import("./pages/Search"));
const RaffleDetails = lazy(() => import("./pages/RaffleDetails"));
const RafflePage = lazy(() => import("./pages/RafflePage"));
const CreateRaffle = lazy(() => import("./pages/CreateRaffle"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const MyRaffles = lazy(() => import("./pages/MyRaffles"));
const CreatorProfile = lazy(() => import("./pages/CreatorProfile"));
const WinnerDemo = lazy(() => import("./pages/WinnerDemo"));
const Settings = lazy(() => import("./pages/Settings"));
const Support = lazy(() => import("./pages/Support"));
const Transparency = lazy(() => import("./pages/Transparency"));
const FAQPage = lazy(() => import("./pages/FAQ/FAQPage"));
const OracleAdmin = lazy(() => import("./pages/OracleAdmin"));

import ErrorBoundary from "./components/ui/ErrorBoundary";

const LazyRoute = ({ Component }: { Component: React.LazyExoticComponent<any> }) => (
    <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
            <Component />
        </Suspense>
    </ErrorBoundary>
);

function App() {
    useEffect(() => {
        checkConnection().then((isAlive) => {
            if (!isAlive) {
                logger.warn(
                    `Stellar Network (${STELLAR_CONFIG.network}) connection failed`,
                );
            } else {
                logger.log(
                    `Stellar Network (${STELLAR_CONFIG.network}) connected:`,
                    isAlive,
                );
            }
        });
    }, []);

    return (
        <AppProviders>
            {/* Issue #120: Global Network Warning
              * This will show at the top of every page if the user is on the wrong network.
            */}
            <NetworkWarning />
            <Routes>
                <Route path="/" element={<LandingLayout />}>
                    <Route index element={<LazyRoute Component={LandingPage} />} />
                    <Route path="home" element={<LazyRoute Component={Home} />} />
                    <Route path="search" element={<LazyRoute Component={SearchPage} />} />
                    <Route path="details" element={<LazyRoute Component={RaffleDetails} />} />
                    <Route path="raffles/:id" element={<LazyRoute Component={RafflePage} />} />
                    <Route path="create" element={<LazyRoute Component={CreateRaffle} />} />
                    <Route path="leaderboard" element={<LazyRoute Component={Leaderboard} />} />
                    <Route path="my-raffles" element={<LazyRoute Component={MyRaffles} />} />
                    <Route path="creators/:address" element={<LazyRoute Component={CreatorProfile} />} />
                    <Route path="winner-demo" element={<LazyRoute Component={WinnerDemo} />} />
                    <Route path="settings" element={<LazyRoute Component={Settings} />} />
                    <Route path="support" element={<LazyRoute Component={Support} />} />
                    <Route path="transparency" element={<LazyRoute Component={Transparency} />} />
                    {/* Issue #192: FAQ Route Added Here */}
                    <Route path="faq" element={<LazyRoute Component={FAQPage} />} />
                    <Route path="admin/oracle" element={<LazyRoute Component={OracleAdmin} />} />
                </Route>
            </Routes>
            <InstallPWA />
        </AppProviders>
    );
}

export default App;
