import React from "react";
import type { LivePreviewProps } from "../../types/types";
const LivePreview: React.FC<LivePreviewProps> = ({ formData }) => {
    const formatDuration = (days: number, hours: number) => {
        if (days === 0 && hours === 0) return "Not set";
        return `${days}d ${hours}h`;
    };

    const formatPrice = (price: number) => {
        if (price === 0) return "Price not set";
        return `$${price.toFixed(2)}`;
    };

    const formatTickets = (tickets: number) => {
        if (tickets === 0) return "—";
        return tickets.toString();
    };

    return (
        <div className="bg-[#1E1932] rounded-xl p-6 h-fit">
            <h3 className="text-white text-xl font-bold mb-6">Live Preview</h3>

            {/* Raffle Image */}
            <div className="mb-4">
                {formData.image ? (
                    <img
                        src={URL.createObjectURL(formData.image)}
                        alt="Raffle prize"
                        className="w-full h-48 object-cover rounded-lg border-2 border-yellow-400"
                    />
                ) : (
                    <div className="w-full h-48 bg-gray-700 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-500">
                        <svg
                            className="w-12 h-12 text-gray-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </div>
                )}
            </div>

            {/* Description */}
            <div className="mb-4">
                <p className="text-white text-sm mb-2">Description</p>
                <p className="text-gray-300 text-sm">
                    {formData.description || "No description provided"}
                </p>
            </div>

            {/* Raffle Details */}
            <div className="space-y-3 mb-6">
                {/* Duration */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <svg
                            className="w-4 h-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <span className="text-white text-sm">Duration</span>
                    </div>
                    <span className="text-white text-sm">
                        {formatDuration(
                            formData.duration.days,
                            formData.duration.hours
                        )}
                    </span>
                </div>

                {/* Tickets */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <svg
                            className="w-4 h-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <span className="text-white text-sm">Tickets</span>
                    </div>
                    <span className="text-white text-sm">
                        {formatTickets(formData.totalTickets)}
                    </span>
                </div>
            </div>

            {/* Price */}
            <div className="mb-6">
                <p className="text-gray-300 text-sm text-center">
                    {formatPrice(formData.pricePerTicket)}
                </p>
            </div>

            {/* Join Raffle Button */}
            <button className="w-full bg-[#FF389C] hover:bg-[#FF389C]/90 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200">
                Join Raffle
            </button>
        </div>
    );
};

export default LivePreview;
