import type { CreateRaffleStep, RaffleFormData } from "../../types/types";

export const WIZARD_STEPS = [
    "details",
    "image",
    "pricing",
    "duration",
    "review",
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

export const DRAFT_STORAGE_KEY = "tikka-create-raffle-draft";

export interface WizardState {
    currentStep: number;
    formData: RaffleFormData;
}

export interface PersistedDraft {
    currentStep: number;
    title: string;
    description: string;
    pricePerTicket: number;
    totalTickets: number;
    duration: {
        days: number;
        hours: number;
    };
}

export type WizardAction =
    | { type: "UPDATE_FORM"; payload: Partial<RaffleFormData> }
    | { type: "NEXT" }
    | { type: "BACK" }
    | { type: "RESET" }
    | { type: "LOAD_DRAFT"; payload: PersistedDraft };

export const STEP_METADATA: Record<
    WizardStepId,
    Pick<CreateRaffleStep, "id" | "title" | "icon">
> = {
    details: { id: "details", title: "Details", icon: "document" },
    image: { id: "image", title: "Image", icon: "image" },
    pricing: { id: "pricing", title: "Pricing", icon: "dollar" },
    duration: { id: "duration", title: "Duration", icon: "clock" },
    review: { id: "review", title: "Review", icon: "check" },
};
