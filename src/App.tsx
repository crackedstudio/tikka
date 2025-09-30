import LandingLayout from "./layouts/    LandingLayout";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import RaffleDetails from "./pages/RaffleDetails";
function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingLayout />}>
                    <Route index element={<LandingPage />} />
                    <Route path="home" element={<Home />} />
                    <Route path="details" element={<RaffleDetails />} />
                </Route>

                {/* <Route path="/game" element={<GameLayout />}>
                    <Route
                        index
                        element={<Game />}
                        errorElement={<RouteError />}
                    />
                    <Route
                        path="ref/:referralId"
                        element={<Game />}
                        errorElement={<RouteError />}
                    />
                    <Route path="play" element={<GamePlay />} />
                    <Route path="leaderboard" element={<Leaderboard />} />
                    <Route path="friends" element={<Friends />} />
                    <Route path="classic" element={<ClassicGames />} />
                </Route> */}
            </Routes>
        </Router>
    );
}

export default App;
