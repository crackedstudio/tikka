import LandingLayout from "./layouts/LandingLayout";
import { lazy, Suspense, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { STELLAR_CONFIG } from "./config/stellar";
import { checkConnection } from "./services/rpcService";
import { AppProviders } from "./providers/AppProviders";
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

function App() {
    useEffect(() => {
        checkConnection().then((isAlive) => {
            console.log(
                `Stellar Network (${STELLAR_CONFIG.network}) connected:`,
                isAlive,
            );
        });
    }, []);

    return (
        <AppProviders>
            <Suspense fallback={<Spinner />}>
                <Routes>

                    <Route path="/" element={<LandingLayout />}>
                        <Route index element={<LandingPage />} />
                        <Route path="home" element={<Home />} />
                        <Route path="search" element={<SearchPage />} />
                        <Route path="details" element={<RaffleDetails />} />
                        <Route path="raffles/:id" element={<RafflePage />} />
                        <Route path="create" element={<CreateRaffle />} />
                        <Route path="leaderboard" element={<Leaderboard />} />
                        <Route path="my-raffles" element={<MyRaffles />} />
                        <Route path="creators/:address" element={<CreatorProfile />} />
                        <Route path="winner-demo" element={<WinnerDemo />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="support" element={<Support />} />
                        <Route path="transparency" element={<Transparency />} />
                        {/* Issue #192: FAQ Route Added Here */}
                        <Route path="faq" element={<FAQPage />} />
                        <Route path="admin/oracle" element={<OracleAdmin />} />
                    </Route>
                </Routes>
            </Suspense>

            <InstallPWA />
        </AppProviders>
    );
}

export default App;
