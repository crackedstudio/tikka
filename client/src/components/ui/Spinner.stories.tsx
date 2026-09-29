import type { Meta, StoryObj } from "@storybook/react";
import { Spinner } from "./Spinner";

const meta: Meta<typeof Spinner> = {
  title: "UI/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Full-width animated loading spinner with accessible status role and dark mode styling.",
      },
    },
    a11y: {
      config: {
        rules: [{ id: "aria-allowed-role", enabled: true }],
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const InContainer: Story = {
  render: () => (
    <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden p-4 max-w-lg mx-auto">
      <h4 className="text-sm font-semibold text-gray-500 mb-2">Loading Raffle Details...</h4>
      <Spinner />
    </div>
  ),
};
