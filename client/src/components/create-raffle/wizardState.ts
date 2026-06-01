import type { CreateRaffleStep, RaffleFormData } from "../../types/types";
import {
    canAdvanceFromStep,
    canGoBackFromStep,
    getStepByIndex,
} from "./validation";
import {
    DRAFT_STORAGE_KEY,
    STEP_METADATA,
    WIZARD_STEP_COUNT,
    WIZARD_STEPS,
    type PersistedDraft,
    type WizardAction,
    type WizardState,
    type WizardStepId,
} from "./wizardTypes";

export function createInitialFormData(): RaffleFormData {
    return {
        title: "",
        description: "",
        image: null,
        images: [],
        pricePerTicket: 0,
        totalTickets: 0,
        duration: {
            days: 0,
            hours: 0,
        },
    };
}

export function createInitialState(overrides?: {
    currentStep?: number;
    formData?: Partial<RaffleFormData>;
}): WizardState {
    return {
        currentStep: overrides?.currentStep ?? 0,
        formData: {
            ...createInitialFormData(),
            ...overrides?.formData,
        },
    };
}

export function serializeDraft(state: WizardState): PersistedDraft {
    const { formData, currentStep } = state;

    return {
        currentStep,
        title: formData.title,
        description: formData.description,
        pricePerTicket: formData.pricePerTicket,
        totalTickets: formData.totalTickets,
        duration: {
            days: formData.duration.days,
            hours: formData.duration.hours,
        },
    };
}

export function hydrateDraft(persisted: PersistedDraft): WizardState {
    return createInitialState({
        currentStep: persisted.currentStep,
        formData: {
            title: persisted.title,
            description: persisted.description,
            pricePerTicket: persisted.pricePerTicket,
            totalTickets: persisted.totalTickets,
            duration: {
                days: persisted.duration.days,
                hours: persisted.duration.hours,
            },
        },
    });
}

export function isPersistedDraft(value: unknown): value is PersistedDraft {
    if (!value || typeof value !== "object") {
        return false;
    }

    const draft = value as Partial<PersistedDraft>;

    return (
        typeof draft.currentStep === "number" &&
        draft.currentStep >= 0 &&
        draft.currentStep < WIZARD_STEP_COUNT &&
        typeof draft.title === "string" &&
        typeof draft.description === "string" &&
        typeof draft.pricePerTicket === "number" &&
        typeof draft.totalTickets === "number" &&
        !!draft.duration &&
        typeof draft.duration.days === "number" &&
        typeof draft.duration.hours === "number"
    );
}

export function saveDraftToStorage(state: WizardState): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(serializeDraft(state))
    );
}

export function loadDraftFromStorage(): WizardState | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isPersistedDraft(parsed)) {
            return null;
        }

        return hydrateDraft(parsed);
    } catch {
        return null;
    }
}

export function clearDraftFromStorage(): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

export function buildStepperSteps(currentStep: number): CreateRaffleStep[] {
    return WIZARD_STEPS.map((stepId, index) => ({
        ...STEP_METADATA[stepId],
        completed: currentStep > index,
        active: currentStep === index,
    }));
}

export function wizardReducer(
    state: WizardState,
    action: WizardAction
): WizardState {
    switch (action.type) {
        case "UPDATE_FORM":
            return {
                ...state,
                formData: {
                    ...state.formData,
                    ...action.payload,
                },
            };
        case "NEXT": {
            if (!canAdvanceFromStep(state.currentStep, state.formData)) {
                return state;
            }

            return {
                ...state,
                currentStep: state.currentStep + 1,
            };
        }
        case "BACK": {
            if (!canGoBackFromStep(state.currentStep)) {
                return state;
            }

            return {
                ...state,
                currentStep: state.currentStep - 1,
            };
        }
        case "RESET":
            clearDraftFromStorage();
            return createInitialState();
        case "LOAD_DRAFT":
            return hydrateDraft(action.payload);
        default:
            return state;
    }
}

export function getCurrentStepId(state: WizardState): WizardStepId {
    return getStepByIndex(state.currentStep);
}
