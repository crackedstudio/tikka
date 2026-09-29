import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import SubscribeForm from "./SubscribeForm";

const meta: Meta<typeof SubscribeForm> = {
  title: "UI/SubscribeForm",
  component: SubscribeForm,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Newsletter subscription form with validated email input field and submit button.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof SubscribeForm>;

export const Default: Story = {};

export const InCard: Story = {
  render: () => (
    <div className="p-8 border border-gray-200 dark:border-white/10 rounded-3xl max-w-lg bg-gray-50 dark:bg-[#11172E]">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        Stay updated with new raffles
      </h3>
      <p className="text-sm text-gray-500 mb-6">
        Subscribe to our newsletter for exclusive access to high-value drops and instant rewards.
      </p>
      <SubscribeForm />
    </div>
  ),
};
