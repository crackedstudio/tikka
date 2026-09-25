import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import { useRaffleDraft } from "./useRaffleDraft";
import {
  EMPTY_RAFFLE_FORM,
  RAFFLE_DRAFT_DEBOUNCE_MS,
  RAFFLE_DRAFT_STORAGE_KEY,
  type RaffleDraftData,
} from "./raffleDraftStorage";
import type { RaffleFormData } from "../../types/forms";

function createDraft(overrides: Partial<RaffleDraftData> = {}): RaffleDraftData {
  return {
    title: "Saved Raffle",
    description: "Draft description",
    pricePerTicket: 0.5,
    totalTickets: 50,
    duration: { days: 1, hours: 0 },
    currentStep: 2,
    savedAt: Date.now(),
    ...overrides,
  };
}

describe("useRaffleDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  function renderDraftHook(
    initialFormData: RaffleFormData = EMPTY_RAFFLE_FORM,
    initialStep = 0,
  ) {
    let formData = initialFormData;
    let currentStep = initialStep;

    const setFormData = vi.fn((updater: SetStateAction<RaffleFormData>) => {
      formData =
        typeof updater === "function"
          ? (updater as (prev: RaffleFormData) => RaffleFormData)(formData)
          : updater;
    });

    const setCurrentStep = vi.fn((updater: SetStateAction<number>) => {
      currentStep =
        typeof updater === "function"
          ? (updater as (prev: number) => number)(currentStep)
          : updater;
    });

    const hook = renderHook(() =>
      useRaffleDraft({
        formData,
        currentStep,
        setFormData,
        setCurrentStep,
      }),
    );

    return { hook, getFormData: () => formData, getCurrentStep: () => currentStep, setFormData, setCurrentStep };
  }

  it("offers to restore a saved draft on mount", () => {
    const draft = createDraft();
    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    const { hook } = renderDraftHook();

    expect(hook.result.current.pendingDraft).toEqual(draft);
    expect(hook.result.current.showRestoreModal).toBe(true);
  });

  it("does not autosave before the restore decision is made", () => {
    const draft = createDraft();
    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    renderDraftHook();

    act(() => {
      vi.advanceTimersByTime(RAFFLE_DRAFT_DEBOUNCE_MS + 100);
    });

    expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBe(
      JSON.stringify(draft),
    );
  });

  it("restores draft into form state and enables autosave", () => {
    const draft = createDraft();
    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    const { hook, getFormData, getCurrentStep } = renderDraftHook();

    act(() => {
      hook.result.current.restoreDraft();
    });

    expect(hook.result.current.showRestoreModal).toBe(false);
    expect(getFormData().title).toBe("Saved Raffle");
    expect(getFormData().description).toBe("Draft description");
    expect(getCurrentStep()).toBe(2);
    expect(getFormData().image).toBeNull();
  });

  it("discards draft and clears localStorage", () => {
    const draft = createDraft();
    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));

    const { hook } = renderDraftHook();

    act(() => {
      hook.result.current.discardDraft();
    });

    expect(hook.result.current.showRestoreModal).toBe(false);
    expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("debounces autosave when no saved draft exists", () => {
    const formData = {
      ...EMPTY_RAFFLE_FORM,
      title: "Live draft",
      description: "Saving soon",
    };

    renderDraftHook(formData, 0);

    expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(RAFFLE_DRAFT_DEBOUNCE_MS);
    });

    const saved = JSON.parse(
      localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY) ?? "{}",
    ) as RaffleDraftData;

    expect(saved.title).toBe("Live draft");
    expect(saved.description).toBe("Saving soon");
    expect(saved.currentStep).toBe(0);
  });

  it("clearDraft removes persisted draft", () => {
    localStorage.setItem(
      RAFFLE_DRAFT_STORAGE_KEY,
      JSON.stringify(createDraft()),
    );

    const { hook } = renderDraftHook();

    act(() => {
      hook.result.current.clearDraft();
    });

    expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
    expect(hook.result.current.showRestoreModal).toBe(false);
  });
});
