import type { Meta, StoryObj } from "@storybook/react";
import CopyButton from "./CopyButton";

const meta: Meta<typeof CopyButton> = {
  title: "UI/CopyButton",
  component: CopyButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Accessible clipboard copy button with fallback support, screen reader announcements, and temporary feedback state.",
      },
    },
  },
  argTypes: {
    value: { control: "text" },
    defaultLabel: { control: "text" },
    copiedLabel: { control: "text" },
    timeoutMs: { control: "number" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof CopyButton>;

export const Default: Story = {
  args: {
    value: "https://tikka.app/raffle/42",
    defaultLabel: "Share Raffle",
    copiedLabel: "Link Copied!",
    className: "flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-medium text-sm transition-colors",
    iconClassName: "w-4 h-4",
  },
};

export const StellarAddress: Story = {
  args: {
    value: "GCEXAMPLESTELARADDRESSFORRAFFLECONTRACT123456789",
    defaultLabel: "Copy Contract ID",
    copiedLabel: "Address Copied!",
    className: "flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-white/20 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-xs font-mono transition-colors",
    iconClassName: "w-3.5 h-3.5 text-gray-500",
  },
};

export const Disabled: Story = {
  args: {
    value: "",
    defaultLabel: "Unavailable",
    disabled: true,
    className: "flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed text-sm",
  },
};
