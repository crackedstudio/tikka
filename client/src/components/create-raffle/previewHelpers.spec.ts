/**
 * Tests for preview formatting helpers
 */

import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatPrice,
  formatTickets,
  formatTitle,
  formatDescription,
  getCreatorPlaceholder,
  getCloseTimePlaceholder,
  isFormDataEmpty,
  isFormDataComplete,
} from "./previewHelpers";
import type { RaffleFormData } from "../../types/types";

describe("previewHelpers", () => {
  describe("formatDuration", () => {
    it("returns placeholder when both days and hours are 0", () => {
      expect(formatDuration(0, 0)).toBe("Duration not set");
    });

    it("formats days and hours correctly", () => {
      expect(formatDuration(5, 3)).toBe("5d 3h");
    });

    it("handles only days", () => {
      expect(formatDuration(7, 0)).toBe("7d 0h");
    });

    it("handles only hours", () => {
      expect(formatDuration(0, 12)).toBe("0d 12h");
    });
  });

  describe("formatPrice", () => {
    it("returns placeholder when price is 0", () => {
      expect(formatPrice(0)).toBe("Price not set");
    });

    it("formats price with 2 decimal places", () => {
      expect(formatPrice(10)).toBe("$10.00");
      expect(formatPrice(5.5)).toBe("$5.50");
      expect(formatPrice(99.99)).toBe("$99.99");
    });
  });

  describe("formatTickets", () => {
    it("returns placeholder when tickets is 0", () => {
      expect(formatTickets(0)).toBe("—");
    });

    it("returns ticket count as string", () => {
      expect(formatTickets(100)).toBe("100");
      expect(formatTickets(1)).toBe("1");
    });
  });

  describe("formatTitle", () => {
    it("returns placeholder when title is empty", () => {
      expect(formatTitle("")).toBe("Raffle title not set");
    });

    it("returns title when provided", () => {
      expect(formatTitle("My Raffle")).toBe("My Raffle");
    });
  });

  describe("formatDescription", () => {
    it("returns placeholder when description is empty", () => {
      expect(formatDescription("")).toBe("No description provided");
    });

    it("returns description when provided", () => {
      expect(formatDescription("This is a raffle")).toBe("This is a raffle");
    });
  });

  describe("getCreatorPlaceholder", () => {
    it("returns creator placeholder text", () => {
      expect(getCreatorPlaceholder()).toBe("Creator not set");
    });
  });

  describe("getCloseTimePlaceholder", () => {
    it("returns close time placeholder text", () => {
      expect(getCloseTimePlaceholder()).toBe("Close time not set");
    });
  });

  describe("isFormDataEmpty", () => {
    it("returns true when all fields are unset", () => {
      const emptyData: RaffleFormData = {
        title: "",
        description: "",
        image: null,
        images: [],
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
      };
      expect(isFormDataEmpty(emptyData)).toBe(true);
    });

    it("returns false when any field is set", () => {
      const partialData: RaffleFormData = {
        title: "My Raffle",
        description: "",
        image: null,
        images: [],
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
      };
      expect(isFormDataEmpty(partialData)).toBe(false);
    });
  });

  describe("isFormDataComplete", () => {
    it("returns true when all required fields are set", () => {
      const completeData: RaffleFormData = {
        title: "My Raffle",
        description: "This is a raffle",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(completeData)).toBe(true);
    });

    it("returns false when title is missing", () => {
      const incompleteData: RaffleFormData = {
        title: "",
        description: "This is a raffle",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });

    it("returns false when description is missing", () => {
      const incompleteData: RaffleFormData = {
        title: "My Raffle",
        description: "",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });

    it("returns false when images are missing", () => {
      const incompleteData: RaffleFormData = {
        title: "My Raffle",
        description: "This is a raffle",
        image: null,
        images: [],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });

    it("returns false when price is 0", () => {
      const incompleteData: RaffleFormData = {
        title: "My Raffle",
        description: "This is a raffle",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 0,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });

    it("returns false when tickets is 0", () => {
      const incompleteData: RaffleFormData = {
        title: "My Raffle",
        description: "This is a raffle",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 10,
        totalTickets: 0,
        duration: { days: 7, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });

    it("returns false when duration is 0", () => {
      const incompleteData: RaffleFormData = {
        title: "My Raffle",
        description: "This is a raffle",
        image: null,
        images: [new File([""], "image.jpg", { type: "image/jpeg" })],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 0, hours: 0 },
      };
      expect(isFormDataComplete(incompleteData)).toBe(false);
    });
  });
});
