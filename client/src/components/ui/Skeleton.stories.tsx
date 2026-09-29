import type { Meta, StoryObj } from "@storybook/react";
import Skeleton from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  argTypes: {
    className: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {
    className: "w-48 h-8",
  },
};

export const TextLine: Story = {
  args: {
    className: "w-full max-w-md h-4",
  },
};

export const Circle: Story = {
  args: {
    className: "w-16 h-16 rounded-full",
  },
};

export const CardPreview: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-4 border border-gray-200 dark:border-white/10 rounded-2xl max-w-sm">
      <Skeleton className="w-full h-40 rounded-xl" />
      <Skeleton className="w-3/4 h-6" />
      <Skeleton className="w-1/2 h-4" />
      <div className="flex gap-2 mt-2">
        <Skeleton className="w-20 h-8 rounded-lg" />
        <Skeleton className="w-20 h-8 rounded-lg" />
      </div>
    </div>
  ),
};
