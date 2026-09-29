import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { Ticket, Search, Trophy } from "lucide-react";
import EmptyState from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Placeholder state shown when lists, queries, or user dashboards have no items to display.",
      },
    },
  },
  argTypes: {
    title: { control: "text" },
    hint: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    icon: <Ticket className="w-8 h-8 text-[#FF389C]" />,
    title: "No Raffles Found",
    hint: "There are currently no active raffles available in this category.",
  },
};

export const WithButtonAction: Story = {
  args: {
    icon: <Search className="w-8 h-8 text-[#FF389C]" />,
    title: "No Search Results",
    hint: "We could not find any raffles matching your filters. Try clearing your filters.",
    action: {
      label: "Clear Filters",
      onClick: () => alert("Filters cleared"),
    },
  },
};

export const WithLinkAction: Story = {
  args: {
    icon: <Trophy className="w-8 h-8 text-[#FF389C]" />,
    title: "No Participations Yet",
    hint: "You have not entered any raffles. Browse active raffles and purchase your first ticket!",
    action: {
      label: "Explore Raffles",
      href: "/raffles",
    },
  },
};
