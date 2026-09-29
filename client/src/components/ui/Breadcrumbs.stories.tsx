import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumbs } from "./Breadcrumbs";

const meta: Meta<typeof Breadcrumbs> = {
  title: "UI/Breadcrumbs",
  component: Breadcrumbs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/raffles/details/42"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: "Breadcrumb navigation trail indicating page hierarchy with Home icon and chevron separators.",
      },
    },
  },
  argTypes: {
    className: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const ExplicitItems: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Raffles", href: "/raffles" },
      { label: "Rolex Submariner 2024" },
    ],
  },
};

export const DeepPath: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Categories", href: "/categories" },
      { label: "Electronics", href: "/categories/electronics" },
      { label: "Smartphones", href: "/categories/electronics/smartphones" },
      { label: "iPhone 16 Pro Max 1TB" },
    ],
  },
};

export const AutomaticFromRoute: Story = {
  render: () => (
    <MemoryRouter initialEntries={["/raffles/details/luxury-gold-bar"]}>
      <Breadcrumbs />
    </MemoryRouter>
  ),
};
