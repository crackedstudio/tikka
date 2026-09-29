import type { Meta, StoryObj } from "@storybook/react";
import Tag from "./Tag";

const meta: Meta<typeof Tag> = {
  title: "UI/Tag",
  component: Tag,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Label and badge tag component with support for dark mode.",
      },
    },
  },
  argTypes: {
    text: {
      control: "text",
      description: "Label text displayed inside the tag",
    },
  },
};

export default meta;
type Story = StoryObj<typeof Tag>;

export const Default: Story = {
  args: {
    text: "Active",
  },
};

export const LiveNow: Story = {
  args: {
    text: "LIVE NOW",
  },
};

export const Ended: Story = {
  args: {
    text: "ENDED",
  },
};

export const TagGroup: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2 items-center">
      <Tag text="Featured" />
      <Tag text="Instant Win" />
      <Tag text="Charity" />
      <Tag text="Exclusive" />
    </div>
  ),
};
