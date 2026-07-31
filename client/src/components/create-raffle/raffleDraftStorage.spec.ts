import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  RAFFLE_DRAFT_STORAGE_KEY,
  clearRaffleDraft,
  draftToFormData,
  formDataToDraft,
  isDraftMeaningful,
  loadRaffleDraft,
  saveRaffleDraft,
  EMPTY_RAFFLE_FORM,
  type RaffleDraftData,
} from "./raffleDraftStorage";

describe("raffleDraftStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("isDraftMeaningful", () => {
    it("returns false for an empty draft", () => {
      const draft: RaffleDraftData = {
        title: "",
        description: "",
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
        currentStep: 0,
        savedAt: Date.now(),
      };

      expect(isDraftMeaningful(draft)).toBe(false);
    });

    it("returns true when title is set", () => {
      const draft: RaffleDraftData = {
        title: "My Raffle",
        description: "",
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
        currentStep: 0,
        savedAt: Date.now(),
      };

      expect(isDraftMeaningful(draft)).toBe(true);
    });

    it("returns true when currentStep is greater than zero", () => {
      const draft: RaffleDraftData = {
        title: "",
        description: "",
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
        currentStep: 2,
        savedAt: Date.now(),
      };

      expect(isDraftMeaningful(draft)).toBe(true);
    });
  });

  describe("formDataToDraft / draftToFormData", () => {
    it("round-trips serializable fields and excludes file binaries", () => {
      const formData = {
        ...EMPTY_RAFFLE_FORM,
        title: "Test Raffle",
        description: "A great prize",
        pricePerTicket: 1.5,
        totalTickets: 100,
        duration: { days: 2, hours: 6 },
        image: new File(["img"], "prize.png", { type: "image/png" }),
        images: [new File(["img"], "extra.png", { type: "image/png" })],
      };

      const draft = formDataToDraft(formData, 3);
      const restored = draftToFormData(draft);

      expect(draft.title).toBe("Test Raffle");
      expect(draft.description).toBe("A great prize");
      expect(draft.pricePerTicket).toBe(1.5);
      expect(draft.totalTickets).toBe(100);
      expect(draft.duration).toEqual({ days: 2, hours: 6 });
      expect(draft.currentStep).toBe(3);
      expect(restored.image).toBeNull();
      expect(restored.images).toEqual([]);
      expect(restored.title).toBe("Test Raffle");
    });
  });

  describe("saveRaffleDraft / loadRaffleDraft / clearRaffleDraft", () => {
    it("persists and loads a meaningful draft from localStorage", () => {
      const draft: RaffleDraftData = {
        title: "Saved Raffle",
        description: "Draft description",
        pricePerTicket: 0.5,
        totalTickets: 50,
        duration: { days: 1, hours: 0 },
        currentStep: 1,
        savedAt: 1_700_000_000_000,
      };

      saveRaffleDraft(draft);

      expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).not.toBeNull();
      expect(loadRaffleDraft()).toEqual(draft);
    });

    it("does not save empty drafts", () => {
      const draft: RaffleDraftData = {
        title: "",
        description: "",
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
        currentStep: 0,
        savedAt: Date.now(),
      };

      saveRaffleDraft(draft);

      expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
      expect(loadRaffleDraft()).toBeNull();
    });

    it("clears stored draft", () => {
      saveRaffleDraft({
        title: "To clear",
        description: "",
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
        currentStep: 0,
        savedAt: Date.now(),
      });

      clearRaffleDraft();

      expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
      expect(loadRaffleDraft()).toBeNull();
    });

    it("returns null for corrupted storage data", () => {
      localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, "{not-json");

      expect(loadRaffleDraft()).toBeNull();
    });

    it("returns null for drafts missing required fields", () => {
      localStorage.setItem(
        RAFFLE_DRAFT_STORAGE_KEY,
        JSON.stringify({ title: "Only title" }),
      );

      expect(loadRaffleDraft()).toBeNull();
    });
  });
});
