import { useState } from "react";
import DiscoverRaffles from "../components/landing/DiscoverRaffles";
import FeaturedRaffle from "../components/landing/FeaturedRaffle";
import Footer from "../components/landing/Footer";
import Hero from "../components/landing/Hero";
import RecentlyAdded from "../components/landing/RecentlyAdded";
import Modal from "../components/modals/Modal";
import Navbar from "../components/Navbar";
import Register from "../components/modals/Register";

const LandingPage = () => {
    const [modalOpen, setModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("Sign Up");

    const changeModal = () => {
        console.log("clicked");
        setModalOpen(true);
    };
    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <Navbar onStart={changeModal} />
            <Hero handleStartClick={changeModal} />
            <DiscoverRaffles />
            <FeaturedRaffle />
            <RecentlyAdded />
            <Footer />
            <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
                <Register
                    activeTab={activeTab}
                    changeActiveTab={setActiveTab}
                />
            </Modal>
        </div>
    );
};

export default LandingPage;
