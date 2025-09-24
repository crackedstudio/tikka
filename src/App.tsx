import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/home" element={<Home />} />
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
