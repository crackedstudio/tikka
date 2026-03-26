import LandingLayout from "./layouts/LandingLayout";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import CreateRaffle from "./pages/CreateRaffle";
import Leaderboard from "./pages/Leaderboard";
import MyRaffles from "./pages/MyRaffles";
import WinnerDemo from "./pages/WinnerDemo";
import SearchPage from "./pages/Search"; // Added for Search

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import RaffleDetails from "./pages/RaffleDetails";
import { useEffect } from "react";
import { STELLAR_CONFIG } from "./config/stellar";
import { checkConnection } from "./services/rpcService";
import { WalletProvider } from "./providers/WalletProvider";
import { AuthProvider } from "./providers/AuthProvider";

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
                <Router>
                    <Routes>
                    <Route path="/" element={<LandingLayout />}>
                        <Route index element={<LandingPage />} />
                        <Route path="home" element={<Home />} />
                        <Route path="search" element={<SearchPage />} /> {/* Added for Search */}
                        <Route path="details" element={<RaffleDetails />} />
                        <Route path="create" element={<CreateRaffle />} />
                        <Route path="leaderboard" element={<Leaderboard />} />
                        <Route path="my-raffles" element={<MyRaffles />} />
                        <Route path="winner-demo" element={<WinnerDemo />} />
                        <Route path="settings" element={<Settings />} />
                    </Route>
                </Routes>
            </Router>
        </AuthProvider>
    </WalletProvider>
    );
}

export default App;