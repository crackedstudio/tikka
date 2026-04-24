import { useState } from "react";
import Footer from "../components/landing/Footer";
import Modal from "../components/modals/Modal";
import Register from "../components/modals/Register";
import Navbar from "../components/Navbar";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import { Outlet } from "react-router-dom";

const LandingLayout = () => {
    const [modalOpen, setModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("Sign Up");
    const changeModal = () => {
        console.log("clicked");
        setModalOpen(true);
    };
    return (
        <div className="bg-[#060C23] text-white flex flex-col space-y-16">
            <Navbar onStart={changeModal} />
            <ErrorBoundary>
                <Outlet />
            </ErrorBoundary>
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

export default LandingLayout;
