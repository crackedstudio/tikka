import React, { useState } from "react";
import Modal from "../components/modals/Modal";
import WinnerAnnouncement from "../components/modals/WinnerAnnouncement";

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
        <div className="min-h-screen bg-[#1A162C] flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-4xl font-bold text-white mb-8">
                    Winner Announcement Demo
                </h1>
                <button
                    onClick={handleOpenModal}
                    className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200"
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
