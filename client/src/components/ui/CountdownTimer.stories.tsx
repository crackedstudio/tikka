import type { Meta, StoryObj } from "@storybook/react";
import { CountdownTimer } from "./CountdownTimer";

const now = Date.now();
const futureThreeDays = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
const futureTwoHours = new Date(now + 2 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString();
const pastDate = new Date(now - 60 * 1000).toISOString();

const meta: Meta<typeof CountdownTimer> = {
  title: "UI/CountdownTimer",
  component: CountdownTimer,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Countdown clock displaying days, hours, minutes, and seconds until an event expires with live SR announcements.",
      },
    },
  },
  argTypes: {
    endTime: {
      control: "text",
      description: "ISO date string or timestamp for end time",
    },
    className: { control: "text" },
    itemClassName: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof CountdownTimer>;

export const ActiveThreeDays: Story = {
  args: {
    endTime: futureThreeDays,
  },
};

export const EndingSoon: Story = {
  args: {
    endTime: futureTwoHours,
  },
};

export const Expired: Story = {
  args: {
    endTime: pastDate,
  },
};

export const CustomStyling: Story = {
  args: {
    endTime: futureThreeDays,
    className: "flex space-x-3 text-lg font-bold",
    itemClassName: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 px-3 py-1 rounded-lg border border-pink-300 dark:border-pink-800",
  },
};
