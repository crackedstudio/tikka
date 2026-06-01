import type { RaffleFormData } from "../../types/types";
import {
    WIZARD_STEPS,
    WIZARD_STEP_COUNT,
    type WizardStepId,
} from "./wizardTypes";

export function getStepByIndex(index: number): WizardStepId {
    const clampedIndex = Math.max(0, Math.min(index, WIZARD_STEP_COUNT - 1));
    return WIZARD_STEPS[clampedIndex];
}

export function getStepIndex(step: WizardStepId): number {
    return WIZARD_STEPS.indexOf(step);
}

export function validateDetailsStep(formData: RaffleFormData): boolean {
    return (
        formData.title.trim() !== "" && formData.description.trim() !== ""
    );
}

export function validateImageStep(formData: RaffleFormData): boolean {
    return formData.images.length > 0;
}

export function validatePricingStep(formData: RaffleFormData): boolean {
    return formData.pricePerTicket > 0 && formData.totalTickets > 0;
}

export function validateDurationStep(formData: RaffleFormData): boolean {
    return formData.duration.days > 0 || formData.duration.hours > 0;
}

export function validateReviewStep(formData: RaffleFormData): boolean {
    return (
        validateDetailsStep(formData) &&
        validateImageStep(formData) &&
        validatePricingStep(formData) &&
        validateDurationStep(formData)
    );
}

export function validateStep(
    step: WizardStepId,
    formData: RaffleFormData
): boolean {
    switch (step) {
        case "details":
            return validateDetailsStep(formData);
        case "image":
            return validateImageStep(formData);
        case "pricing":
            return validatePricingStep(formData);
        case "duration":
            return validateDurationStep(formData);
        case "review":
            return validateReviewStep(formData);
    }
}

export function canAdvanceFromStep(
    stepIndex: number,
    formData: RaffleFormData
): boolean {
    if (stepIndex < 0 || stepIndex >= WIZARD_STEP_COUNT - 1) {
        return false;
    }

    return validateStep(getStepByIndex(stepIndex), formData);
}

export function canGoBackFromStep(stepIndex: number): boolean {
    return stepIndex > 0;
}
