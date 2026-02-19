import React, { useState } from "react";
import type { RaffleFormData, CreateRaffleStep } from "../types/types";
import ProgressStepper from "../components/create-raffle/ProgressStepper";
import DetailsStep from "../components/create-raffle/DetailsStep";
import ImageStep from "../components/create-raffle/ImageStep";
import PricingStep from "../components/create-raffle/PricingStep";
import DurationStep from "../components/create-raffle/DurationStep";
import ReviewStep from "../components/create-raffle/ReviewStep";
import LivePreview from "../components/create-raffle/LivePreview";

const CreateRaffle: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<RaffleFormData>({
        title: "",
        description: "",
        image: null,
        pricePerTicket: 0,
        totalTickets: 0,
        duration: {
            days: 0,
            hours: 0,
        },
    });

    const steps: CreateRaffleStep[] = [
        {
            id: "details",
            title: "Details",
            icon: "document",
            completed: currentStep > 0,
            active: currentStep === 0,
        },
        {
            id: "image",
            title: "Image",
            icon: "image",
            completed: currentStep > 1,
            active: currentStep === 1,
        },
        {
            id: "pricing",
            title: "Pricing",
            icon: "dollar",
            completed: currentStep > 2,
            active: currentStep === 2,
        },
        {
            id: "duration",
            title: "Duration",
            icon: "clock",
            completed: currentStep > 3,
            active: currentStep === 3,
        },
        {
            id: "review",
            title: "Review",
            icon: "check",
            completed: currentStep > 4,
            active: currentStep === 4,
        },
    ];

    const updateFormData = (data: Partial<RaffleFormData>) => {
        setFormData((prev) => ({ ...prev, ...data }));
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const renderCurrentStep = () => {
        const stepProps = {
            formData,
            updateFormData,
            onNext: handleNext,
            onBack: handleBack,
        };

        switch (currentStep) {
            case 0:
                return <DetailsStep {...stepProps} />;
            case 1:
                return <ImageStep {...stepProps} />;
            case 2:
                return <PricingStep {...stepProps} />;
            case 3:
                return <DurationStep {...stepProps} />;
            case 4:
                return <ReviewStep {...stepProps} />;
            default:
                return <DetailsStep {...stepProps} />;
        }
    };

    return (
        <div className="min-h-screen text-white">
            {/* Header */}
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                {/* Page Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        Create New Raffle
                    </h1>
                    <p className="text-gray-300">
                        Setup your raffle in a few simple steps
                    </p>
                </div>

                {/* Progress Stepper */}
                <div className="mb-12">
                    <ProgressStepper steps={steps} currentStep={currentStep} />
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
                    {/* Left Panel - Form */}
                    <div className="space-y-6">{renderCurrentStep()}</div>

                    {/* Right Panel - Live Preview */}
                    <div className="lg:sticky lg:top-8 lg:h-fit">
                        <LivePreview formData={formData} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateRaffle;
