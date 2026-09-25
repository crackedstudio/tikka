import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import CreateRaffle from "./CreateRaffle";
import { RAFFLE_DRAFT_STORAGE_KEY } from "../components/create-raffle/raffleDraftStorage";

// Mock the components that have external dependencies
vi.mock("../components/create-raffle/LivePreview", () => ({
  default: () => <div data-testid="live-preview">Live Preview</div>,
}));

vi.mock("../components/ui/Breadcrumbs", () => ({
  Breadcrumbs: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

const renderCreateRaffle = () => {
  return render(
    <BrowserRouter>
      <CreateRaffle />
    </BrowserRouter>
  );
};

describe("CreateRaffle - Draft Autosave Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("autosaves form data to localStorage after debounce", async () => {
    renderCreateRaffle();

    // Find and fill in the title field
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: "My Test Raffle" } });

    // Advance timers to trigger debounced save (500ms)
    vi.advanceTimersByTime(500);

    // Check localStorage
    const savedDraft = localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY);
    expect(savedDraft).not.toBeNull();

    const parsed = JSON.parse(savedDraft!);
    expect(parsed.title).toBe("My Test Raffle");
    expect(parsed.currentStep).toBe(0);
    expect(parsed.savedAt).toBeGreaterThan(0);
  });

  it("offers to restore a saved draft on mount", async () => {
    // Set up a saved draft
    const savedDraft = {
      title: "Saved Raffle",
      description: "This was saved earlier",
      pricePerTicket: 1.5,
      totalTickets: 100,
      duration: { days: 2, hours: 6 },
      currentStep: 2,
      savedAt: Date.now(),
    };

    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(savedDraft));

    renderCreateRaffle();

    // Should show restore modal
    await waitFor(() => {
      expect(screen.getByText(/restore saved draft/i)).toBeInTheDocument();
      expect(screen.getByText(/Saved Raffle/i)).toBeInTheDocument();
    });
  });

  it("restores draft when user clicks 'Restore draft'", async () => {
    const savedDraft = {
      title: "Restored Raffle",
      description: "Restored description",
      pricePerTicket: 2.0,
      totalTickets: 50,
      duration: { days: 1, hours: 12 },
      currentStep: 1,
      savedAt: Date.now(),
    };

    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(savedDraft));

    renderCreateRaffle();

    // Wait for modal and click restore
    const restoreButton = await screen.findByText(/restore draft/i);
    fireEvent.click(restoreButton);

    // Verify form was populated
    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toBe("Restored Raffle");
    });
  });

  it("discards draft when user clicks 'Start fresh'", async () => {
    const savedDraft = {
      title: "To Be Discarded",
      description: "Will be removed",
      pricePerTicket: 1.0,
      totalTickets: 25,
      duration: { days: 1, hours: 0 },
      currentStep: 0,
      savedAt: Date.now(),
    };

    localStorage.setItem(RAFFLE_DRAFT_STORAGE_KEY, JSON.stringify(savedDraft));

    renderCreateRaffle();

    // Wait for modal and click discard
    const discardButton = await screen.findByText(/start fresh/i);
    fireEvent.click(discardButton);

    // Verify localStorage was cleared
    await waitFor(() => {
      expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
    });

    // Verify form remains empty
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe("");
  });

  it("does not save empty drafts", async () => {
    renderCreateRaffle();

    // Advance timers without entering any data
    vi.advanceTimersByTime(500);

    // localStorage should remain empty
    expect(localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("updates draft when navigating between steps", async () => {
    renderCreateRaffle();

    // Fill in title on step 1
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: "Multi-step Raffle" } });

    // Move to next step
    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    // Wait for debounce
    vi.advanceTimersByTime(500);

    // Check that currentStep was updated in localStorage
    const savedDraft = localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY);
    expect(savedDraft).not.toBeNull();

    const parsed = JSON.parse(savedDraft!);
    expect(parsed.title).toBe("Multi-step Raffle");
    expect(parsed.currentStep).toBe(1);
  });

  it("excludes uploaded files from draft", async () => {
    renderCreateRaffle();

    // Fill in some data
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: "Raffle with Image" } });

    // Note: We can't easily test file upload in this unit test,
    // but we verify that the storage spec handles it correctly
    vi.advanceTimersByTime(500);

    const savedDraft = localStorage.getItem(RAFFLE_DRAFT_STORAGE_KEY);
    const parsed = JSON.parse(savedDraft!);

    // Verify no file-related fields are in the draft
    expect(parsed).not.toHaveProperty("image");
    expect(parsed).not.toHaveProperty("images");
    expect(parsed.title).toBe("Raffle with Image");
  });
});
