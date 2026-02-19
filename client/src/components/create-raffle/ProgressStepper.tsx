import React from "react";
import type { ProgressStepperProps } from "../../types/types";

const ProgressStepper: React.FC<ProgressStepperProps> = ({
    steps,
    currentStep,
}) => {
    return (
        <div className="w-full max-w-4xl mx-auto px-6">
            <div className="flex items-center justify-between relative">
                {/* Progress line */}
                <div className="absolute top-6 left-12 right-12 h-0.5 bg-gray-600 z-0">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                        style={{
                            width: `${
                                (currentStep / (steps.length - 1)) * 100
                            }%`,
                        }}
                    />
                </div>

                {steps.map((step) => (
                    <div
                        key={step.id}
                        className="flex flex-col items-center relative z-10"
                    >
                        {/* Step circle */}
                        <div
                            className={`
                            w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300
                            ${
                                step.completed
                                    ? "bg-green-500 border-green-500"
                                    : step.active
                                    ? "bg-green-500 border-green-500"
                                    : "bg-transparent border-gray-600"
                            }
                        `}
                        >
                            {step.completed || step.active ? (
                                <svg
                                    className="w-6 h-6 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    {step.icon === "document" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "image" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "dollar" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "clock" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "check" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                </svg>
                            ) : (
                                <svg
                                    className="w-6 h-6 text-gray-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    {step.icon === "document" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "image" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "dollar" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "clock" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                    {step.icon === "check" && (
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    )}
                                </svg>
                            )}
                        </div>

                        {/* Step label */}
                        <span
                            className={`
                            mt-2 text-sm font-medium transition-colors duration-300
                            ${
                                step.completed || step.active
                                    ? "text-white"
                                    : "text-gray-400"
                            }
                        `}
                        >
                            {step.title}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProgressStepper;
