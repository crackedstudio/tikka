import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LeaderboardSection from "./LeaderboardSection";
import type { Player, TopPlayer } from "../../types/leaderboard";

const topPlayers: TopPlayer[] = [
  { id: "top", name: "Top Player", rank: 1, xp: 1000, color: "gold" },
];
const players: Player[] = [
  { id: "player", name: "Listed Player", rank: 1, wins: 2, xpWon: 500 },
];

describe("LeaderboardSection", () => {
  it("renders the selected tab and leaderboard content", () => {
    render(
      <LeaderboardSection
        activeTab="weekly"
        onTabChange={vi.fn()}
        topPlayers={topPlayers}
        players={players}
      />,
    );

    expect(screen.getByRole("heading", { name: "Leaderboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weekly" })).toHaveClass("bg-gray-200");
    expect(screen.getByRole("button", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All Time" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top Player" })).toBeInTheDocument();
    expect(screen.getByText("Listed Player")).toBeInTheDocument();
  });

  it("passes tab selections to the parent", () => {
    const onTabChange = vi.fn();
    render(
      <LeaderboardSection
        activeTab="weekly"
        onTabChange={onTabChange}
        topPlayers={topPlayers}
        players={players}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));

    expect(onTabChange).toHaveBeenCalledWith("monthly");
  });
});