import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    canAdvanceFromStep,
    canGoBackFromStep,
    getStepByIndex,
    validateStep,
} from "./validation";
import {
    buildStepperSteps,
    clearDraftFromStorage,
    createInitialFormData,
    createInitialState,
    hydrateDraft,
    loadDraftFromStorage,
    saveDraftToStorage,
    serializeDraft,
    wizardReducer,
} from "./wizardState";
import { DRAFT_STORAGE_KEY, WIZARD_STEP_COUNT } from "./wizardTypes";

function createValidFormData() {
    return {
        ...createInitialFormData(),
        title: "Grand Prize",
        description: "A wonderful raffle prize",
        image: new File(["image"], "prize.png", { type: "image/png" }),
        images: [new File(["image"], "prize.png", { type: "image/png" })],
        pricePerTicket: 5,
        totalTickets: 100,
        duration: {
            days: 2,
            hours: 4,
        },
    };
}

describe("create raffle wizard validation", () => {
    it("validates each step independently", () => {
        const empty = createInitialFormData();
        const valid = createValidFormData();

        expect(validateStep("details", empty)).toBe(false);
        expect(validateStep("image", empty)).toBe(false);
        expect(validateStep("pricing", empty)).toBe(false);
        expect(validateStep("duration", empty)).toBe(false);
        expect(validateStep("review", empty)).toBe(false);

        expect(validateStep("details", valid)).toBe(true);
        expect(validateStep("image", valid)).toBe(true);
        expect(validateStep("pricing", valid)).toBe(true);
        expect(validateStep("duration", valid)).toBe(true);
        expect(validateStep("review", valid)).toBe(true);
    });

    it("allows duration when only hours are set", () => {
        const formData = createInitialFormData();
        formData.duration.hours = 3;

        expect(validateStep("duration", formData)).toBe(true);
    });

    it("reports whether navigation is allowed from a step index", () => {
        const validState = createInitialState({ formData: createValidFormData() });

        expect(canGoBackFromStep(0)).toBe(false);
        expect(canGoBackFromStep(2)).toBe(true);
        expect(canAdvanceFromStep(0, validState.formData)).toBe(true);
        expect(canAdvanceFromStep(WIZARD_STEP_COUNT - 1, validState.formData)).toBe(
            false
        );
        expect(
            canAdvanceFromStep(0, createInitialState().formData)
        ).toBe(false);
    });
});

describe("create raffle wizard reducer", () => {
    it("advances to the next step when the current step is valid", () => {
        const state = createInitialState({
            formData: {
                ...createInitialFormData(),
                title: "Title",
                description: "Description",
            },
        });

        const nextState = wizardReducer(state, { type: "NEXT" });

        expect(nextState.currentStep).toBe(1);
        expect(getStepByIndex(nextState.currentStep)).toBe("image");
    });

    it("does not advance on invalid transitions", () => {
        const state = createInitialState();

        const nextState = wizardReducer(state, { type: "NEXT" });

        expect(nextState).toBe(state);
    });

    it("does not advance past the review step", () => {
        const state = createInitialState({
            currentStep: WIZARD_STEP_COUNT - 1,
            formData: createValidFormData(),
        });

        const nextState = wizardReducer(state, { type: "NEXT" });

        expect(nextState).toBe(state);
    });

    it("moves back one step when not on the first step", () => {
        const state = createInitialState({ currentStep: 2 });

        const nextState = wizardReducer(state, { type: "BACK" });

        expect(nextState.currentStep).toBe(1);
    });

    it("does not move back from the first step", () => {
        const state = createInitialState();

        const nextState = wizardReducer(state, { type: "BACK" });

        expect(nextState).toBe(state);
    });

    it("merges partial form updates", () => {
        const state = createInitialState();

        const nextState = wizardReducer(state, {
            type: "UPDATE_FORM",
            payload: { title: "Updated title" },
        });

        expect(nextState.formData.title).toBe("Updated title");
        expect(nextState.formData.description).toBe("");
    });

    it("resets wizard state and clears persisted drafts", () => {
        const state = createInitialState({
            currentStep: 3,
            formData: createValidFormData(),
        });
        saveDraftToStorage(state);

        const nextState = wizardReducer(state, { type: "RESET" });

        expect(nextState).toEqual(createInitialState());
        expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    });

    it("clears persisted draft after successful publish (reset on review step)", () => {
        const state = createInitialState({
            currentStep: WIZARD_STEP_COUNT - 1,
            formData: createValidFormData(),
        });
        saveDraftToStorage(state);
        expect(loadDraftFromStorage()?.formData.title).toBe("Grand Prize");

        const nextState = wizardReducer(state, { type: "RESET" });

        expect(nextState.currentStep).toBe(0);
        expect(nextState.formData).toEqual(createInitialFormData());
        expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    });

    it("loads prefilled drafts into wizard state", () => {
        const draft = {
            currentStep: 2,
            title: "Saved raffle",
            description: "Saved description",
            pricePerTicket: 12.5,
            totalTickets: 50,
            duration: { days: 1, hours: 6 },
        };

        const nextState = wizardReducer(createInitialState(), {
            type: "LOAD_DRAFT",
            payload: draft,
        });

        expect(nextState.currentStep).toBe(2);
        expect(nextState.formData.title).toBe("Saved raffle");
        expect(nextState.formData.description).toBe("Saved description");
        expect(nextState.formData.pricePerTicket).toBe(12.5);
        expect(nextState.formData.totalTickets).toBe(50);
        expect(nextState.formData.duration).toEqual({ days: 1, hours: 6 });
        expect(nextState.formData.images).toEqual([]);
    });
    it("blocks publish when review validation fails", () => {
        const incomplete = createInitialState({
            currentStep: WIZARD_STEP_COUNT - 1,
            formData: {
                ...createInitialFormData(),
                title: "Title only",
                description: "Missing other required fields",
            },
        });

        expect(validateStep("review", incomplete.formData)).toBe(false);
    });
});

describe("create raffle wizard draft persistence", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        clearDraftFromStorage();
    });

    it("serializes and hydrates drafts without image files", () => {
        const state = createInitialState({
            currentStep: 1,
            formData: {
                ...createInitialFormData(),
                title: "Draft title",
                description: "Draft description",
            },
        });

        const hydrated = hydrateDraft(serializeDraft(state));

        expect(hydrated.currentStep).toBe(1);
        expect(hydrated.formData.title).toBe("Draft title");
        expect(hydrated.formData.images).toEqual([]);
    });

    it("loads persisted drafts from localStorage", () => {
        const state = createInitialState({
            currentStep: 3,
            formData: {
                ...createInitialFormData(),
                title: "Stored draft",
                description: "Stored description",
                pricePerTicket: 3,
                totalTickets: 20,
                duration: { days: 0, hours: 12 },
            },
        });

        saveDraftToStorage(state);

        expect(loadDraftFromStorage()).toEqual(state);
    });

    it("returns null for invalid persisted drafts", () => {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, '{"currentStep":"bad"}');

        expect(loadDraftFromStorage()).toBeNull();
    });
});

describe("create raffle wizard stepper metadata", () => {
    it("builds stepper steps from the current step index", () => {
        const steps = buildStepperSteps(2);

        expect(steps).toHaveLength(WIZARD_STEP_COUNT);
        expect(steps[0].completed).toBe(true);
        expect(steps[1].completed).toBe(true);
        expect(steps[2].active).toBe(true);
        expect(steps[3].completed).toBe(false);
        expect(steps[4].completed).toBe(false);
    });
});
