import LandingLayout from "./layouts/LandingLayout";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import CreateRaffle from "./pages/CreateRaffle";
import Leaderboard from "./pages/Leaderboard";
import MyRaffles from "./pages/MyRaffles";
import WinnerDemo from "./pages/WinnerDemo";

import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import RaffleDetails from "./pages/RaffleDetails";
import { useEffect } from "react";
import { STELLAR_CONFIG } from "./config/stellar";
import { checkConnection } from "./services/rpcService";
function App() {
  //   useEffect(() => {
  //     checkConnection().then((isAlive) => {
  //       console.log(
  //         `Stellar Network (${STELLAR_CONFIG.network}) connected:`,
  //         isAlive,
  //       );
  //     });
  //   }, []);
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="home" element={<Home />} />
          <Route path="details" element={<RaffleDetails />} />
          <Route path="create" element={<CreateRaffle />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="my-raffles" element={<MyRaffles />} />
          <Route path="winner-demo" element={<WinnerDemo />} />
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
