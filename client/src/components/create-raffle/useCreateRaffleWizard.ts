import { useEffect, useReducer } from "react";
import type { RaffleFormData } from "../../types/types";
import { validateStep } from "./validation";
import {
    buildStepperSteps,
    createInitialState,
    getCurrentStepId,
    loadDraftFromStorage,
    saveDraftToStorage,
    wizardReducer,
} from "./wizardState";
import type { WizardStepId } from "./wizardTypes";

export function useCreateRaffleWizard() {
    const [state, dispatch] = useReducer(
        wizardReducer,
        undefined,
        () => loadDraftFromStorage() ?? createInitialState()
    );

    useEffect(() => {
        saveDraftToStorage(state);
    }, [state]);

    const currentStepId = getCurrentStepId(state);

    return {
        state,
        formData: state.formData,
        currentStep: state.currentStep,
        currentStepId,
        steps: buildStepperSteps(state.currentStep),
        updateFormData: (data: Partial<RaffleFormData>) =>
            dispatch({ type: "UPDATE_FORM", payload: data }),
        handleNext: () => dispatch({ type: "NEXT" }),
        handleBack: () => dispatch({ type: "BACK" }),
        reset: () => dispatch({ type: "RESET" }),
        canGoNext: validateStep(currentStepId, state.formData),
        isStepValid: (step: WizardStepId) =>
            validateStep(step, state.formData),
    };
}
