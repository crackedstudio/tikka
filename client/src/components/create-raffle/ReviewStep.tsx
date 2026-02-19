import React from "react";
import type { StepComponentProps } from "../../types/types";
import CreateRaffleButton from "../CreateRaffleButton";

const ReviewStep: React.FC<StepComponentProps> = ({
    formData,
    onNext,
    onBack,
}) => {
    const formatDuration = (days: number, hours: number) => {
        return `${days}d ${hours}h`;
    };

    const potentialRevenue = formData.pricePerTicket * formData.totalTickets;

    return (
        <div className="bg-[#1E1932] rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-2">
                <svg
                    className="w-6 h-6 text-green-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                    />
                </svg>
                <h3 className="text-white text-xl font-bold">
                    Review & Publish
                </h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
                Double-check everything before going live
            </p>

            <div className="space-y-6">
                {/* Raffle Details */}
                <div>
                    <h4 className="text-white font-semibold mb-3">
                        Raffle Details
                    </h4>
                    <div className="space-y-2">
                        <div className="flex">
                            <span className="text-gray-400 w-24">Title:</span>
                            <span className="text-white">
                                {formData.title || "Not set"}
                            </span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-400 w-24">
                                Description:
                            </span>
                            <span className="text-white">
                                {formData.description || "Not set"}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Pricing */}
                <div>
                    <h4 className="text-white font-semibold mb-3">Pricing</h4>
                    <div className="space-y-2">
                        <div className="flex">
                            <span className="text-gray-400 w-24">
                                Ticket Price:
                            </span>
                            <span className="text-white">
                                ${formData.pricePerTicket.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-400 w-24">
                                Total Tickets:
                            </span>
                            <span className="text-white">
                                {formData.totalTickets}
                            </span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-400 w-24">
                                Duration:
                            </span>
                            <span className="text-white">
                                {formatDuration(
                                    formData.duration.days,
                                    formData.duration.hours
                                )}
                            </span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-400 w-24">Revenue:</span>
                            <span className="text-white font-semibold">
                                ${potentialRevenue.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Image Preview */}
                {formData.image && (
                    <div>
                        <h4 className="text-white font-semibold mb-3">
                            Prize Image
                        </h4>
                        <img
                            src={URL.createObjectURL(formData.image)}
                            alt="Raffle prize"
                            className="w-full h-48 object-cover rounded-lg border-2 border-yellow-400"
                        />
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-8">
                <button
                    onClick={onBack}
                    className="px-6 py-3 bg-[#2A264A] text-white rounded-lg hover:bg-[#3A365A] transition-colors duration-200"
                >
                    Back
                </button>
                <CreateRaffleButton
                    title={formData.title}
                    description={formData.description}
                    image={
                        formData.image
                            ? URL.createObjectURL(formData.image)
                            : "/src/assets/cptpnk.png"
                    }
                    prizeName={formData.title}
                    prizeValue={formData.pricePerTicket.toString()}
                    prizeCurrency="ETH"
                    category="General"
                    tags={[]}
                    endTime={
                        Math.floor(Date.now() / 1000) +
                        formData.duration.days * 24 * 60 * 60 +
                        formData.duration.hours * 60 * 60
                    }
                    maxTickets={formData.totalTickets}
                    allowMultipleTickets={true}
                    ticketPrice={(
                        parseFloat(formData.pricePerTicket.toString()) * 1e18
                    ).toString()} // Convert to wei
                    onSuccess={(raffleId) => {
                        console.log(
                            "Raffle created successfully with ID:",
                            raffleId
                        );
                        onNext();
                    }}
                    onError={(error) => {
                        console.error("Error creating raffle:", error);
                        alert(error);
                    }}
                >
                    Publish Raffle
                </CreateRaffleButton>
            </div>
        </div>
    );
};

export default ReviewStep;
