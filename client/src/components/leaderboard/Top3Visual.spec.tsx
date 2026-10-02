import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Top3Visual from "./Top3Visual";
import type { TopPlayer } from "../../types/leaderboard";

const players: TopPlayer[] = [
  { id: "first", name: "First", rank: 1, xp: 12500, color: "gold" },
  { id: "second", name: "Second", rank: 2, xp: 9000, color: "silver" },
  { id: "third", name: "Third", rank: 3, xp: 7200, color: "bronze" },
];

describe("Top3Visual", () => {
  it("renders the top three with localized XP totals", () => {
    render(<Top3Visual players={players} />);

    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();
    expect(screen.getByText("12,500 XP")).toBeInTheDocument();
    expect(screen.getByText("9,000 XP")).toBeInTheDocument();
    expect(screen.getByText("7,200 XP")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(1);
    expect(screen.getAllByText("2")).toHaveLength(1);
    expect(screen.getAllByText("3")).toHaveLength(1);
  });

  it("positions second, first, and third place left to right", () => {
    const { container } = render(<Top3Visual players={players} />);
    const cards = Array.from(container.firstElementChild?.children ?? []);

    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(cards[0]).toHaveClass("order-2");
    expect(cards[1]).toHaveClass("order-1");
    expect(cards[2]).toHaveClass("order-3");
  });

  it("handles fallback styling for other ranks and empty list", () => {
    const customPlayers: TopPlayer[] = [
      { id: "other", name: "Fourth", rank: 4, xp: 5000, color: "gray" },
    ];
    const { container } = render(<Top3Visual players={customPlayers} />);
    const card = container.querySelector(".bg-gray-500");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("Fourth")).toBeInTheDocument();
  });
});