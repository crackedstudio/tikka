import React, { useRef, useEffect } from "react";
import ProgressStepper from "../components/create-raffle/ProgressStepper";
import DetailsStep from "../components/create-raffle/DetailsStep";
import ImageStep from "../components/create-raffle/ImageStep";
import PricingStep from "../components/create-raffle/PricingStep";
import DurationStep from "../components/create-raffle/DurationStep";
import ReviewStep from "../components/create-raffle/ReviewStep";
import LivePreview from "../components/create-raffle/LivePreview";
import { useCreateRaffleWizard } from "../components/create-raffle/useCreateRaffleWizard";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";

const CreateRaffle: React.FC = () => {
    const stepPanelRef = useRef<HTMLDivElement>(null);
    const {
        formData,
        currentStep,
        steps,
        updateFormData,
        handleNext,
        handleBack,
        canGoNext,
        reset,
    } = useCreateRaffleWizard();

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Enter to advance to next step
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();
                if (canGoNext) {
                    handleNext();
                }
            }
            // Escape to go back
            if (e.key === "Escape") {
                e.preventDefault();
                if (currentStep > 0) {
                    handleBack();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [canGoNext, currentStep, handleBack, handleNext]);

    // Focus management: focus first focusable element in step panel when step changes
    useEffect(() => {
        if (!stepPanelRef.current) return;
        const focusable = stepPanelRef.current.querySelector<HTMLElement>(
            'input, textarea, button, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
    }, [currentStep]);

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
                return <ReviewStep {...stepProps} onNext={reset} />;
            default:
                return <DetailsStep {...stepProps} />;
        }
    };

    return (
        <div className="min-h-screen text-gray-900 dark:text-white">
            {/* Header */}
            <div className="w-full max-w-7xl mx-auto px-6 py-8">
                <div className="mb-4">
                    <Breadcrumbs />
                </div>
                {/* Page Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        Create New Raffle
                    </h1>
                    <p className="text-gray-700 dark:text-gray-300">
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
                    <div className="space-y-6" ref={stepPanelRef} role="region" aria-label={`Step ${currentStep + 1}: ${steps[currentStep].title}`}>
                        {renderCurrentStep()}
                    </div>

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
