import React from "react";
import type { StepComponentProps } from "../../types/types";

const DetailsStep: React.FC<StepComponentProps> = ({
    formData,
    updateFormData,
    onNext,
    onBack,
}) => {
    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateFormData({ title: e.target.value });
    };

    const handleDescriptionChange = (
        e: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        updateFormData({ description: e.target.value });
    };

    const canContinue =
        formData.title.trim() !== "" && formData.description.trim() !== "";

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
                        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                        clipRule="evenodd"
                    />
                </svg>
                <h3 className="text-white text-xl font-bold">Raffle Details</h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
                Tell participants what they could win
            </p>

            <div className="space-y-6">
                {/* Title Input */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Raffle Title
                    </label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={handleTitleChange}
                        placeholder="Enter raffle title"
                        className="w-full px-4 py-3 bg-[#2A264A] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
                    />
                </div>

                {/* Description Input */}
                <div>
                    <label className="block text-white text-sm font-medium mb-2">
                        Description
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={handleDescriptionChange}
                        placeholder="Describe your raffle prize in detail"
                        rows={4}
                        className="w-full px-4 py-3 bg-[#2A264A] border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent resize-none"
                    />
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

export default DetailsStep;
