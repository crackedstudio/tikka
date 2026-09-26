/**
 * DurationStep Tests
 *
 * Covers the duration arithmetic that feeds the contract call
 * (durationInSeconds = days * 86400 + hours * 3600):
 *  - boundary values around the minimum accepted duration
 *  - the disabled/enabled state of the "Continue" advance control
 *  - the increment/decrement floor so a duration can never go negative
 *  - back-navigation preserving the entered days/hours
 */

import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DurationStep from "./DurationStep";
import type { RaffleFormData } from "../../types/forms";

const makeForm = (
  duration: { days: number; hours: number },
): RaffleFormData => ({
  title: "",
  description: "",
  image: null,
  images: [],
  pricePerTicket: 0,
  totalTickets: 0,
  duration,
});

const renderStep = (duration: { days: number; hours: number }) => {
  const updateFormData = vi.fn();
  const onNext = vi.fn();
  const onBack = vi.fn();
  const utils = render(
    <DurationStep
      formData={makeForm(duration)}
      updateFormData={updateFormData}
      onNext={onNext}
      onBack={onBack}
    />,
  );
  return { ...utils, updateFormData, onNext, onBack };
};

const continueButton = () => screen.getByRole("button", { name: "Continue" });
const inputs = () => screen.getAllByRole("spinbutton");
const daysInput = () => inputs()[0];
const hoursInput = () => inputs()[1];

const StepHarness: React.FC<{ initial: { days: number; hours: number } }> = ({
  initial,
}) => {
  const [formData, setFormData] = useState<RaffleFormData>(makeForm(initial));
  const [visible, setVisible] = useState(true);

  return (
    <div>
      <button type="button" onClick={() => setVisible((v) => !v)}>
        toggle-step
      </button>
      {visible && (
        <DurationStep
          formData={formData}
          updateFormData={(data) =>
            setFormData((prev) => ({ ...prev, ...data }))
          }
          onNext={() => {}}
          onBack={() => {}}
        />
      )}
      <output data-testid="duration">
        {formData.duration.days}d {formData.duration.hours}h
      </output>
    </div>
  );
};

describe("DurationStep", () => {
  describe("duration arithmetic and validation", () => {
    it("treats an empty duration as not set and blocks Continue", () => {
      renderStep({ days: 0, hours: 0 });

      expect(screen.getByText("Not set")).toBeInTheDocument();
      expect(continueButton()).toBeDisabled();
    });

    it("enables Continue at the minimum accepted duration of one hour", () => {
      renderStep({ days: 0, hours: 1 });

      // 1 * 3600 = 3600 seconds, the smallest positive total on this step.
      expect(screen.getByText("0d 1h")).toBeInTheDocument();
      expect(continueButton()).toBeEnabled();
    });

    it("enables Continue for a whole day", () => {
      renderStep({ days: 1, hours: 0 });

      expect(screen.getByText("1d 0h")).toBeInTheDocument();
      expect(continueButton()).toBeEnabled();
    });

    it("enables Continue at the largest single-field boundary (1d 23h)", () => {
      renderStep({ days: 1, hours: 23 });

      expect(screen.getByText("1d 23h")).toBeInTheDocument();
      expect(continueButton()).toBeEnabled();
    });

    it("treats a negative day count as invalid so a past end time is impossible", () => {
      renderStep({ days: -1, hours: 0 });

      // durationInSeconds = -86400 fails the positive-int schema, so the user
      // can never advance with an already-elapsed duration.
      expect(continueButton()).toBeDisabled();
    });

    it("treats negative hours as invalid", () => {
      renderStep({ days: 0, hours: -3 });

      expect(continueButton()).toBeDisabled();
    });

    it("caps the hours input with a max of 23", () => {
      renderStep({ days: 0, hours: 0 });

      expect(hoursInput()).toHaveAttribute("max", "23");
    });
  });

  describe("advance control behaviour", () => {
    it("does not advance while Continue is disabled", () => {
      const { onNext } = renderStep({ days: 0, hours: 0 });

      fireEvent.click(continueButton());

      expect(onNext).not.toHaveBeenCalled();
    });

    it("advances when the duration is valid", () => {
      const { onNext } = renderStep({ days: 2, hours: 3 });

      fireEvent.click(continueButton());

      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("increment and decrement", () => {
    it("increments days and hours", () => {
      const { updateFormData } = renderStep({ days: 1, hours: 2 });

      fireEvent.click(screen.getByRole("button", { name: "Increase days" }));
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 2, hours: 2 },
      });

      fireEvent.click(screen.getByRole("button", { name: "Increase hours" }));
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 1, hours: 3 },
      });
    });

    it("decrements days and hours", () => {
      const { updateFormData } = renderStep({ days: 2, hours: 2 });

      fireEvent.click(screen.getByRole("button", { name: "Decrease days" }));
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 1, hours: 2 },
      });

      fireEvent.click(screen.getByRole("button", { name: "Decrease hours" }));
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 2, hours: 1 },
      });
    });

    it("never decrements days below zero", () => {
      const { updateFormData } = renderStep({ days: 0, hours: 5 });

      fireEvent.click(screen.getByRole("button", { name: "Decrease days" }));

      expect(updateFormData).not.toHaveBeenCalled();
    });

    it("never decrements hours below zero", () => {
      const { updateFormData } = renderStep({ days: 5, hours: 0 });

      fireEvent.click(screen.getByRole("button", { name: "Decrease hours" }));

      expect(updateFormData).not.toHaveBeenCalled();
    });
  });

  describe("typed input", () => {
    it("parses typed days and hours", () => {
      const { updateFormData } = renderStep({ days: 0, hours: 0 });

      fireEvent.change(daysInput(), { target: { value: "3" } });
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 3, hours: 0 },
      });

      fireEvent.change(hoursInput(), { target: { value: "5" } });
      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 0, hours: 5 },
      });
    });

    it("normalises a cleared field to zero", () => {
      const { updateFormData } = renderStep({ days: 4, hours: 4 });

      fireEvent.change(daysInput(), { target: { value: "" } });

      expect(updateFormData).toHaveBeenCalledWith({
        duration: { days: 0, hours: 4 },
      });
    });
  });

  describe("navigation", () => {
    it("calls onBack without changing the entered duration", () => {
      const { onBack, updateFormData } = renderStep({ days: 3, hours: 4 });

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(updateFormData).not.toHaveBeenCalled();
    });

    it("preserves the duration when the step is left and re-entered", () => {
      render(<StepHarness initial={{ days: 2, hours: 4 }} />);

      expect(screen.getByTestId("duration")).toHaveTextContent("2d 4h");

      fireEvent.click(screen.getByRole("button", { name: "toggle-step" }));
      fireEvent.click(screen.getByRole("button", { name: "toggle-step" }));

      expect(screen.getByTestId("duration")).toHaveTextContent("2d 4h");
    });
  });
});
