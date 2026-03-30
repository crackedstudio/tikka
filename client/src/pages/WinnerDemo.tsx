import React, { useState } from "react";
import Modal from "../components/modals/Modal";
import WinnerAnnouncement from "../components/modals/WinnerAnnouncement";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const WinnerDemo: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleClaimPrize = () => {
        console.log("Claiming prize...");
        // Here you would implement the actual prize claiming logic
        alert("Prize claimed! (This is a demo)");
    };

    const handleBackToHome = () => {
        console.log("Going back to home...");
        // Here you would navigate to the home page
        window.location.href = "/";
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#1A162C] flex items-center justify-center relative">
            <div className="absolute w-full max-w-7xl mx-auto top-0 left-0 right-0 px-6 py-8">
                <Breadcrumbs />
            </div>
            <div className="text-center mt-12">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
                    Winner Announcement Demo
                </h1>
                <button
                    onClick={handleOpenModal}
                    className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200"
                >
                    Show Winner Modal
                </button>
            </div>

            <Modal open={isModalOpen} onClose={handleCloseModal}>
                <WinnerAnnouncement
                    onClose={handleCloseModal}
                    onClaimPrize={handleClaimPrize}
                    onBackToHome={handleBackToHome}
                    prizeName="Lamborghini Aventador, Limited Edition 2023"
                    prizeValue="$500,000"
                    walletAddress="0x330cd8fec...8b7c"
                    isVisible={isModalOpen}
                />
            </Modal>
        </div>
    );
};

export default WinnerDemo;
