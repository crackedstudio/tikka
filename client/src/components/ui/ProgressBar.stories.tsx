import type { Meta, StoryObj } from "@storybook/react";
import { ProgressBar } from "./ProgressBar";

const meta: Meta<typeof ProgressBar> = {
  title: "UI/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Progress indicator with gradient fill, sheen animation, and ARIA progressbar compliance.",
      },
    },
  },
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Progress value between 0 and 100",
    },
    label: { control: "text" },
    height: { control: "text" },
    showPercent: { control: "boolean" },
    shimmer: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: {
    value: 65,
    label: "Tickets Sold",
    showPercent: true,
    shimmer: true,
  },
};

export const LowProgress: Story = {
  args: {
    value: 15,
    label: "Raffle Filling",
    showPercent: true,
    shimmer: true,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
    label: "Sold Out",
    showPercent: true,
    shimmer: false,
  },
};

export const ThickBar: Story = {
  args: {
    value: 40,
    label: "Funding Goal",
    height: "12px",
    showPercent: true,
    shimmer: true,
  },
};

export const MinimalNoLabel: Story = {
  args: {
    value: 80,
    height: "6px",
    showPercent: false,
  },
};
