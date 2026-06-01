import React from "react";
import type { StepComponentProps } from "../../types/types";
import { validateStep } from "./validation";
import Button from "../ui/Button";
import NumberInput from "../ui/NumberInput";

const PricingStep: React.FC<StepComponentProps> = ({
  formData,
  updateFormData,
  onNext,
  onBack,
}) => {
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    updateFormData({ pricePerTicket: value });
  };

  const handleTicketsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    updateFormData({ totalTickets: value });
  };

  const incrementTickets = () => {
    updateFormData({ totalTickets: formData.totalTickets + 1 });
  };

  const decrementTickets = () => {
    if (formData.totalTickets > 0) {
      updateFormData({ totalTickets: formData.totalTickets - 1 });
    }
  };

  const potentialRevenue = formData.pricePerTicket * formData.totalTickets;

  const canContinue = validateStep("pricing", formData);

  return (
    <div className="bg-white dark:bg-[#1E1932] rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-2">
        <svg
          className="w-6 h-6 text-gray-900 dark:text-white"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
            clipRule="evenodd"
          />
        </svg>
        <h3 className="text-gray-900 dark:text-white text-xl font-bold">
          $ Ticket Pricing
        </h3>
      </div>
      <p className="text-gray-700 dark:text-gray-300 text-sm mb-6">
        Set your ticket price and quantity
      </p>

      <div className="space-y-6">
        {/* Price Per Ticket */}
        <div>
          <label className="block text-gray-900 dark:text-white text-sm font-medium mb-2">
            Price Per Ticket ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.pricePerTicket}
            onChange={handlePriceChange}
            placeholder="0.0"
            className="w-full px-4 py-3 bg-gray-200 dark:bg-[#2A264A] border border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent"
          />
        </div>

        {/* Total Tickets */}
        <NumberInput
          label="Total Tickets Available"
          min={0}
          value={formData.totalTickets}
          onChange={handleTicketsChange}
          onIncrement={incrementTickets}
          onDecrement={decrementTickets}
        />

        {/* Potential Revenue */}
        <div>
          <label className="block text-gray-900 dark:text-white text-sm font-medium mb-2">
            Potential Revenue
          </label>
          <div className="px-4 py-3 bg-gray-200 dark:bg-[#2A264A] border border-gray-600 rounded-lg">
            <span className="text-gray-900 dark:text-white text-lg font-semibold">
              ${potentialRevenue.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8 gap-4">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onNext} disabled={!canContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
};

export default PricingStep;
