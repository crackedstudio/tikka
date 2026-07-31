import type { RaffleFormData } from "../../types/types";

export const RAFFLE_DRAFT_STORAGE_KEY = "tikka-create-raffle-draft";
export const RAFFLE_DRAFT_DEBOUNCE_MS = 500;

/** Serializable subset of the create-raffle form (excludes uploaded File binaries). */
export interface RaffleDraftData {
  title: string;
  description: string;
  pricePerTicket: number;
  totalTickets: number;
  duration: {
    days: number;
    hours: number;
  };
  currentStep: number;
  savedAt: number;
}

export const EMPTY_RAFFLE_FORM: RaffleFormData = {
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

export function formDataToDraft(
  formData: RaffleFormData,
  currentStep: number,
): RaffleDraftData {
  return {
    title: formData.title,
    description: formData.description,
    pricePerTicket: formData.pricePerTicket,
    totalTickets: formData.totalTickets,
    duration: {
      days: formData.duration.days,
      hours: formData.duration.hours,
    },
    currentStep,
    savedAt: Date.now(),
  };
}

export function draftToFormData(draft: RaffleDraftData): RaffleFormData {
  return {
    ...EMPTY_RAFFLE_FORM,
    title: draft.title,
    description: draft.description,
    pricePerTicket: draft.pricePerTicket,
    totalTickets: draft.totalTickets,
    duration: {
      days: draft.duration.days,
      hours: draft.duration.hours,
    },
  };
}

export function isDraftMeaningful(draft: RaffleDraftData): boolean {
  return (
    draft.title.trim() !== "" ||
    draft.description.trim() !== "" ||
    draft.pricePerTicket > 0 ||
    draft.totalTickets > 0 ||
    draft.duration.days > 0 ||
    draft.duration.hours > 0 ||
    draft.currentStep > 0
  );
}

export function loadRaffleDraft(): RaffleDraftData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<RaffleDraftData>;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.description !== "string" ||
      typeof parsed.pricePerTicket !== "number" ||
      typeof parsed.totalTickets !== "number" ||
      !parsed.duration ||
      typeof parsed.duration.days !== "number" ||
      typeof parsed.duration.hours !== "number" ||
      typeof parsed.currentStep !== "number"
    ) {
      return null;
    }

    const draft: RaffleDraftData = {
      title: parsed.title,
      description: parsed.description,
      pricePerTicket: parsed.pricePerTicket,
      totalTickets: parsed.totalTickets,
      duration: {
        days: parsed.duration.days,
        hours: parsed.duration.hours,
      },
      currentStep: parsed.currentStep,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };

    return isDraftMeaningful(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function saveRaffleDraft(draft: RaffleDraftData): void {
  if (typeof window === "undefined") return;
  if (!isDraftMeaningful(draft)) return;

  window.localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearRaffleDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RAFFLE_DRAFT_STORAGE_KEY);
}
