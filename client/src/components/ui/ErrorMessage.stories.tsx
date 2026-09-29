import type { Meta, StoryObj } from "@storybook/react";
import ErrorMessage from "./ErrorMessage";

const meta: Meta<typeof ErrorMessage> = {
  title: "UI/ErrorMessage",
  component: ErrorMessage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Error display component with full-page and inline variants, optional retry actions, and loading states.",
      },
    },
  },
  argTypes: {
    title: { control: "text" },
    message: { control: "text" },
    variant: {
      control: "radio",
      options: ["full", "inline"],
    },
    retryLabel: { control: "text" },
    disabled: { control: "boolean" },
    onRetry: { action: "retry-clicked" },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorMessage>;

export const FullDefault: Story = {
  args: {
    title: "Something went wrong",
    message: "Failed to load raffle details from Stellar RPC. Please try again.",
    variant: "full",
  },
};

export const FullWithRetry: Story = {
  args: {
    title: "Network Connection Lost",
    message: "Unable to reach the server. Check your internet connection and retry.",
    variant: "full",
    retryLabel: "Retry Connection",
    onRetry: () => alert("Retry requested"),
  },
};

export const InlineVariant: Story = {
  args: {
    title: "Invalid transaction signature",
    message: "The wallet rejected the transaction request.",
    variant: "inline",
  },
};

export const InlineWithRetry: Story = {
  args: {
    title: "Could not fetch participants",
    variant: "inline",
    retryLabel: "Refresh list",
    onRetry: () => alert("Refreshing..."),
  },
};

export const RetryDisabled: Story = {
  args: {
    title: "Connecting to Horizon node...",
    message: "Please wait while the connection attempts to re-establish.",
    variant: "full",
    retryLabel: "Retrying...",
    disabled: true,
    onRetry: () => {},
  },
};
