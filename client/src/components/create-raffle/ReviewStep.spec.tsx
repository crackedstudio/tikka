/**
 * ReviewStep Tests
 *
 * The last gate before signing: everything the step displays has to be exactly
 * what is handed to CreateRaffleButton (and therefore to the contract call).
 * Covers:
 *  - the values rendered for the user to confirm
 *  - the exact props passed to the submit control (title, tickets, price, endTime)
 *  - the network-fee estimate in its loading / success / failure states
 *  - back-navigation not submitting anything
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReviewStep from "./ReviewStep";
import type { RaffleFormData } from "../../types/forms";

const hoisted = vi.hoisted(() => ({
  estimateCreate: vi.fn(),
  lastButtonProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock("../../services/sdkClient", () => ({
  estimateCreate: hoisted.estimateCreate,
}));

// Capture the props the review step hands to the submit control instead of
// exercising the wallet/SDK pipeline (covered by CreateRaffleButton's own tests).
vi.mock("../CreateRaffleButton", () => ({
  default: (props: Record<string, unknown>) => {
    hoisted.lastButtonProps = props;
    return (
      <button type="button" data-testid="confirm-submit">
        {props.children as React.ReactNode}
      </button>
    );
  },
}));

const makeForm = (overrides: Partial<RaffleFormData> = {}): RaffleFormData => ({
  title: "Signed Stellar Raffle",
  description: "A prize worth winning",
  image: null,
  images: [],
  pricePerTicket: 2.5,
  totalTickets: 10,
  duration: { days: 1, hours: 2 },
  ...overrides,
});

const renderStep = (
  formData: RaffleFormData,
  handlers: {
    onNext?: () => void;
    onBack?: () => void;
    onSubmitSuccess?: () => void;
  } = {},
) => {
  const onNext = handlers.onNext ?? vi.fn();
  const onBack = handlers.onBack ?? vi.fn();
  const onSubmitSuccess = handlers.onSubmitSuccess ?? vi.fn();
  return render(
    <MemoryRouter>
      <ReviewStep
        formData={formData}
        updateFormData={vi.fn()}
        onNext={onNext}
        onBack={onBack}
        onSubmitSuccess={onSubmitSuccess}
      />
    </MemoryRouter>,
  );
};

/** Waits for the default (successful) fee estimate to settle. */
const feeSettled = () => screen.findByText("0.0000100 XLM");

const ONE_DAY_TWO_HOURS = 86_400 + 7_200; // 93_600 seconds

describe("ReviewStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.lastButtonProps = undefined;
    hoisted.estimateCreate.mockResolvedValue({
      success: true,
      data: { xlm: "0.0000100", stroops: "100" },
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:mock-image"),
      writable: true,
      configurable: true,
    });
  });

  describe("displayed confirmation values", () => {
    it("shows the raffle details, pricing and duration that will be submitted", async () => {
      renderStep(makeForm());

      expect(screen.getByText("Signed Stellar Raffle")).toBeInTheDocument();
      expect(screen.getByText("A prize worth winning")).toBeInTheDocument();
      expect(screen.getByText("$2.50")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("1d 2h")).toBeInTheDocument();
      // 2.5 * 10 tickets
      expect(screen.getByText("$25.00")).toBeInTheDocument();

      await feeSettled();
    });

    it("falls back to placeholders when optional details are empty", async () => {
      renderStep(makeForm({ title: "", description: "" }));

      expect(screen.getAllByText("Not set")).toHaveLength(2);

      await feeSettled();
    });

    it("renders the prize image preview when one was selected", async () => {
      const image = new File([new Uint8Array(4)], "prize.png", {
        type: "image/png",
      });
      renderStep(makeForm({ image, images: [image] }));

      expect(screen.getByAltText("Raffle prize")).toBeInTheDocument();

      await feeSettled();
    });

    it("omits the prize image section when no image was selected", async () => {
      renderStep(makeForm({ image: null }));

      expect(screen.queryByAltText("Raffle prize")).not.toBeInTheDocument();

      await feeSettled();
    });
  });

  describe("values handed to the submit control", () => {
    it("passes the exact contract parameters derived from the form", async () => {
      const image = new File([new Uint8Array(4)], "prize.png", {
        type: "image/png",
      });
      const before = Math.floor(Date.now() / 1000);

      renderStep(makeForm({ image, images: [image] }));

      const after = Math.floor(Date.now() / 1000);
      const props = hoisted.lastButtonProps;

      expect(props).toBeDefined();
      expect(props).toMatchObject({
        title: "Signed Stellar Raffle",
        description: "A prize worth winning",
        prizeName: "Signed Stellar Raffle",
        prizeValue: "2.5",
        prizeCurrency: "ETH",
        maxTickets: 10,
        allowMultipleTickets: true,
        // 2.5 XLM -> stroops
        ticketPrice: "25000000",
        imageFile: image,
        children: "Confirm & Submit",
      });

      const endTime = props?.endTime as number;
      expect(endTime).toBeGreaterThanOrEqual(before + ONE_DAY_TWO_HOURS);
      expect(endTime).toBeLessThanOrEqual(after + ONE_DAY_TWO_HOURS);

      expect(typeof props?.onSuccess).toBe("function");
      expect(typeof props?.onError).toBe("function");

      await feeSettled();
    });

    it("renders Confirm & Submit as the final action", async () => {
      renderStep(makeForm());

      expect(screen.getByTestId("confirm-submit")).toHaveTextContent(
        "Confirm & Submit",
      );

      await feeSettled();
    });
  });

  describe("network fee estimate", () => {
    it("shows a loading state while the estimate is pending", () => {
      hoisted.estimateCreate.mockReturnValue(new Promise(() => {}));

      renderStep(makeForm());

      expect(screen.getByText("Calculating...")).toBeInTheDocument();
    });

    it("shows the estimated fee once the simulation resolves", async () => {
      renderStep(makeForm());

      expect(await feeSettled()).toBeInTheDocument();
    });

    it("asks the estimator for the contract arguments", async () => {
      renderStep(makeForm());

      await feeSettled();

      expect(hoisted.estimateCreate).toHaveBeenCalledWith({
        ticketPrice: "25000000",
        totalTickets: 10,
        durationInSeconds: ONE_DAY_TWO_HOURS,
      });
    });

    it("surfaces a failed estimate from the estimator", async () => {
      hoisted.estimateCreate.mockResolvedValue({
        success: false,
        error: "Simulation failed: insufficient balance",
      });

      renderStep(makeForm());

      expect(
        await screen.findByText("Simulation failed: insufficient balance"),
      ).toBeInTheDocument();
    });

    it("surfaces a thrown estimate error", async () => {
      hoisted.estimateCreate.mockRejectedValue(new Error("RPC endpoint down"));

      renderStep(makeForm());

      expect(await screen.findByText("RPC endpoint down")).toBeInTheDocument();
    });

    it("clamps a negative duration to zero before asking the estimator", async () => {
      renderStep(makeForm({ duration: { days: -1, hours: 0 } }));

      await feeSettled();

      expect(hoisted.estimateCreate).toHaveBeenCalledWith(
        expect.objectContaining({ durationInSeconds: 0 }),
      );
    });
  });

  describe("navigation", () => {
    it("calls onBack without submitting", async () => {
      const onBack = vi.fn();
      const onNext = vi.fn();
      renderStep(makeForm(), { onBack, onNext });

      await feeSettled();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(onNext).not.toHaveBeenCalled();
    });
  });
});
