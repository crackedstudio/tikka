import LandingLayout from "./layouts/LandingLayout";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import CreateRaffle from "./pages/CreateRaffle";
import Leaderboard from "./pages/Leaderboard";
import MyRaffles from "./pages/MyRaffles";
import WinnerDemo from "./pages/WinnerDemo";
import SearchPage from "./pages/Search";
import Transparency from "./pages/Transparency";
import Settings from "./pages/Settings";
import RafflePage from "./pages/RafflePage";
import OracleAdmin from "./pages/OracleAdmin";

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import RaffleDetails from "./pages/RaffleDetails";
import { useEffect } from "react";
import { STELLAR_CONFIG } from "./config/stellar";
import { checkConnection } from "./services/rpcService";
import { WalletProvider } from "./providers/WalletProvider";
import { AuthProvider } from "./providers/AuthProvider";
import NetworkWarning from "./components/NetworkWarning";
import { InstallPWA } from "./components/InstallPWA";

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
        <WalletProvider>
            <AuthProvider>
                {/* * Issue #120: Global Network Warning 
                  * This will show at the top of every page if the user is on the wrong network.
                */}
                <NetworkWarning />
                
                <Router>
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
                            <Route path="winner-demo" element={<WinnerDemo />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="transparency" element={<Transparency />} />
                            <Route path="admin/oracle" element={<OracleAdmin />} />
                        </Route>
                    </Routes>
                </Router>
                
                <InstallPWA />
            </AuthProvider>
        </WalletProvider>
    );
}

export default App;