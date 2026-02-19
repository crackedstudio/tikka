import React, { useRef, useState } from "react";
import type { StepComponentProps } from "../../types/types";

const ImageStep: React.FC<StepComponentProps> = ({
    formData,
    updateFormData,
    onNext,
    onBack,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleFileSelect = (file: File) => {
        if (file && file.type.startsWith("image/")) {
            updateFormData({ image: file });
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const canContinue = formData.image !== null;

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
                        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                        clipRule="evenodd"
                    />
                </svg>
                <h3 className="text-white text-xl font-bold">Prize Image</h3>
            </div>
            <p className="text-gray-300 text-sm mb-6">
                A great photo increases participation
            </p>

            {/* Upload Area */}
            <div
                className={`
                    border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 cursor-pointer
                    ${
                        isDragOver
                            ? "border-[#FF389C] bg-[#FF389C]/10"
                            : "border-gray-500 hover:border-gray-400"
                    }
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleUploadClick}
            >
                {formData.image ? (
                    <div className="space-y-4">
                        <img
                            src={URL.createObjectURL(formData.image)}
                            alt="Uploaded prize"
                            className="w-full h-48 object-cover rounded-lg mx-auto"
                        />
                        <p className="text-white text-sm">
                            Click to change image
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <svg
                            className="w-16 h-16 text-gray-400 mx-auto"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <div>
                            <p className="text-white text-lg mb-2">
                                Drag & Drop your prize image here
                            </p>
                            <p className="text-gray-400 mb-4">or</p>
                            <button className="bg-[#FF389C] hover:bg-[#FF389C]/90 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-200">
                                Upload image
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
            />

            <p className="text-gray-400 text-sm mt-4 text-center">
                Upload a clear picture of your prize. This is what excites
                players
            </p>

            {/* Image Tips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="bg-[#2A264A] rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-2">
                        <svg
                            className="w-5 h-5 text-purple-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <h4 className="text-white font-medium">
                            Good Lighting
                        </h4>
                    </div>
                    <p className="text-gray-400 text-sm">
                        Natural light works best
                    </p>
                </div>

                <div className="bg-[#2A264A] rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-2">
                        <svg
                            className="w-5 h-5 text-purple-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <h4 className="text-white font-medium">
                            Multiple Angles
                        </h4>
                    </div>
                    <p className="text-gray-400 text-sm">
                        Show different perspectives
                    </p>
                </div>

                <div className="bg-[#2A264A] rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-2">
                        <svg
                            className="w-5 h-5 text-purple-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                clipRule="evenodd"
                            />
                        </svg>
                        <h4 className="text-white font-medium">
                            Clear Background
                        </h4>
                    </div>
                    <p className="text-gray-400 text-sm">
                        Avoid cluttered backdrops
                    </p>
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

export default ImageStep;
