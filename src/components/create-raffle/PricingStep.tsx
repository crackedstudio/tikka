import React from "react";
import type { StepComponentProps } from "../../types/types";

const PricingStep: React.FC<StepComponentProps> = ({
    formData,
    updateFormData,
    onNext,
    onBack,
}) => {
    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value) || 0;
        updateFormData({ pricePerTicket: value });
    };

    const handleTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value) || 0;
        updateFormData({ totalTickets: value });
    };

    const incrementTickets = () => {
        updateFormData({ totalTickets: formData.totalTickets + 1 });
    };

    const decrementTickets = () => {
        if (formData.totalTickets > 0) {
            updateFormData({ totalTickets: formData.totalTickets - 1 });
        }
    };

    const potentialRevenue = formData.pricePerTicket * formData.totalTickets;

    const canContinue =
        formData.pricePerTicket > 0 && formData.totalTickets > 0;

    return (
        <div className="bg-[#1E1932] rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-2">
                <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                    />
                </svg>
                <h3 className="text-white text-xl font-bold">
                    $ Ticket Pricing
                </h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
                Set your ticket price and quantity
            </p>

            <div className="space-y-6">
                {/* Price Per Ticket */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Price Per Ticket ($)
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.pricePerTicket}
                        onChange={handlePriceChange}
                        placeholder="0.0"
                        className="w-full px-4 py-3 bg-[#2A264A] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
                    />
                </div>

                {/* Total Tickets */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Total Tickets Available
                    </label>
                    <div className="relative">
                        <input
                            type="number"
                            min="0"
                            value={formData.totalTickets}
                            onChange={handleTicketsChange}
                            placeholder="0"
                            className="w-full px-4 py-3 pr-16 bg-[#2A264A] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
                        />
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col">
                            <button
                                onClick={incrementTickets}
                                className="text-gray-400 hover:text-white transition-colors duration-200"
                            >
                                <svg
                                    className="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={decrementTickets}
                                className="text-gray-400 hover:text-white transition-colors duration-200"
                            >
                                <svg
                                    className="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fillRule="evenodd"
                                        d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Potential Revenue */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Potential Revenue
                    </label>
                    <div className="px-4 py-3 bg-[#2A264A] border border-gray-600 rounded-lg">
                        <span className="text-white text-lg font-semibold">
                            ${potentialRevenue.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
                <button
                    onClick={onBack}
                    className="px-6 py-3 bg-[#2A264A] text-white rounded-lg hover:bg-[#3A365A] transition-colors duration-200"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!canContinue}
                    className={`px-6 py-3 rounded-lg font-medium transition-colors duration-200 ${
                        canContinue
                            ? "bg-[#FF389C] hover:bg-[#FF389C]/90 text-white"
                            : "bg-gray-600 text-gray-400 cursor-not-allowed"
                    }`}
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default PricingStep;
