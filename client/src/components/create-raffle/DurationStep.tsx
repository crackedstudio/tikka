import React from "react";
import type { StepComponentProps } from "../../types/types";

const DurationStep: React.FC<StepComponentProps> = ({
    formData,
    updateFormData,
    onNext,
    onBack,
}) => {
    const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value) || 0;
        updateFormData({
            duration: {
                ...formData.duration,
                days: value,
            },
        });
    };

    const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value) || 0;
        updateFormData({
            duration: {
                ...formData.duration,
                hours: value,
            },
        });
    };

    const incrementDays = () => {
        updateFormData({
            duration: {
                ...formData.duration,
                days: formData.duration.days + 1,
            },
        });
    };

    const decrementDays = () => {
        if (formData.duration.days > 0) {
            updateFormData({
                duration: {
                    ...formData.duration,
                    days: formData.duration.days - 1,
                },
            });
        }
    };

    const incrementHours = () => {
        updateFormData({
            duration: {
                ...formData.duration,
                hours: formData.duration.hours + 1,
            },
        });
    };

    const decrementHours = () => {
        if (formData.duration.hours > 0) {
            updateFormData({
                duration: {
                    ...formData.duration,
                    hours: formData.duration.hours - 1,
                },
            });
        }
    };

    const formatEndTime = () => {
        if (formData.duration.days === 0 && formData.duration.hours === 0) {
            return "Not set";
        }
        return `${formData.duration.days}d ${formData.duration.hours}h`;
    };

    const canContinue =
        formData.duration.days > 0 || formData.duration.hours > 0;

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
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                    />
                </svg>
                <h3 className="text-white text-xl font-bold">
                    Raffle Duration
                </h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
                How long will the raffle run?
            </p>

            <div className="space-y-6">
                {/* Duration Inputs */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Days */}
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">
                            Days
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                value={formData.duration.days}
                                onChange={handleDaysChange}
                                className="w-full px-4 py-3 pr-12 bg-[#2A264A] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
                            />
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col">
                                <button
                                    onClick={incrementDays}
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
                                    onClick={decrementDays}
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

                    {/* Hours */}
                    <div>
                        <label className="block text-white text-sm font-medium mb-2">
                            Hours
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                min="0"
                                max="23"
                                value={formData.duration.hours}
                                onChange={handleHoursChange}
                                className="w-full px-4 py-3 pr-12 bg-[#2A264A] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
                            />
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col">
                                <button
                                    onClick={incrementHours}
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
                                    onClick={decrementHours}
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
                </div>

                {/* End Time Display */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Raffle will end in
                    </label>
                    <div className="px-4 py-3 bg-[#2A264A] border border-gray-600 rounded-lg text-center">
                        <span className="text-white text-lg font-semibold">
                            {formatEndTime()}
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

export default DurationStep;
