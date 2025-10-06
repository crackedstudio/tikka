import { useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import metamask from "../../assets/metamask.png";

interface TicketConfirmationProps {
    onClose: () => void;
    raffleName?: string;
    pricePerTicket?: string;
    usdPrice?: string;
    gasFee?: string;
    onBuyTickets?: () => void;
}

const TicketConfirmation = ({
    onClose,
    raffleName = "Bali All Sponsored Ticket",
    pricePerTicket = "0.01 ETH",
    usdPrice = "$85.45 USD",
    gasFee = "0.003 ETH",
    onBuyTickets,
}: TicketConfirmationProps) => {
    const [ticketCount, setTicketCount] = useState(22);
    const [walletAddress] = useState("0x330cd8fec...8b7c");

    const handleDecrease = () => {
        if (ticketCount > 1) {
            setTicketCount(ticketCount - 1);
        }
    };

    const handleIncrease = () => {
        setTicketCount(ticketCount + 1);
    };

    const calculateTotal = () => {
        const price = parseFloat(pricePerTicket.split(" ")[0]);
        const gas = parseFloat(gasFee.split(" ")[0]);
        const total = price * ticketCount + gas;
        return total.toFixed(3);
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white mb-2">
                        Purchase a ticket
                    </h2>
                    <p className="text-white text-sm">
                        You are about to purchase a ticket for{" "}
                        <span className="font-semibold">{raffleName}</span>{" "}
                        raffle.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="text-white hover:text-gray-300 transition-colors ml-4"
                    aria-label="Close modal"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Wallet Connection Section */}
            <div className="bg-[#2A2A3E] rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {/* Metamask Icon */}
                        <div className="rounded-full flex items-center justify-center">
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                                <img src={metamask} alt="" />
                            </div>
                        </div>
                        <div>
                            <p className="text-white font-medium">
                                {walletAddress}
                            </p>
                            <p className="text-white text-sm">Metamask</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="bg-[#42A846] text-white px-3 py-1 rounded-full text-sm font-medium mb-1">
                            Connected
                        </div>
                        <button className="text-gray-400 text-sm hover:text-white transition-colors">
                            Change
                        </button>
                    </div>
                </div>
            </div>

            {/* Ticket Details */}
            <div className="space-y-4 mb-6 text-[14px]">
                {/* Price Per Ticket */}
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">
                        Price Per Ticket
                    </span>
                    <div className="text-right">
                        <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                            <span className="text-white font-medium">
                                {pricePerTicket}
                            </span>
                        </div>
                        <p className="text-gray-400 text-xs">= {usdPrice}</p>
                    </div>
                </div>

                {/* Number of Tickets */}
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">
                        Number of tickets
                    </span>
                    <div className="flex items-center">
                        <button
                            onClick={handleDecrease}
                            className="w-8 h-8 bg-[#00E6CC33] text-[#00E6CC] rounded-lg flex items-center justify-center hover:brightness-95 transition-all"
                            disabled={ticketCount <= 1}
                        >
                            <Minus size={16} />
                        </button>
                        <span className="text-white font-medium min-w-[40px] text-center">
                            {ticketCount}
                        </span>
                        <button
                            onClick={handleIncrease}
                            className="w-8 h-8 bg-[#00E6CC33] text-[#00E6CC] rounded-lg flex items-center justify-center hover:brightness-95 transition-all"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {/* Gas Fee */}
                <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">
                        Gas fee (estimated)
                    </span>
                    <span className="text-white font-medium">{gasFee}</span>
                </div>

                {/* Total */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1F263F]">
                    <span className="text-gray-400 text-sm">Total</span>
                    <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-yellow-400 rounded-full"></div>
                        <span className="text-white font-medium">
                            {calculateTotal()} ETH
                        </span>
                    </div>
                </div>
            </div>

            {/* Buy Tickets Button */}
            <button
                onClick={onBuyTickets}
                className="w-full bg-[#fe3796] hover:bg-[#fe3796]/90 text-white font-semibold py-4 px-6 rounded-xl transition-colors"
            >
                Buy Tickets
            </button>
        </div>
    );
};

export default TicketConfirmation;
