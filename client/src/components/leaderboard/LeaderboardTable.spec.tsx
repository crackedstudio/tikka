import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LeaderboardTable from "./LeaderboardTable";
import type { Player } from "../../types/leaderboard";

const players: Player[] = [
  {
    id: "player-1",
    name: "You",
    rank: 1,
    wins: 8,
    xpWon: 12500,
    badges: [{ id: "star", name: "Rising Star", icon: "star", color: "yellow" }],
  },
  { id: "player-2", name: "Morgan", rank: 2, wins: 6, xpWon: 9000 },
];

describe("LeaderboardTable", () => {
  it("renders player rankings, totals, and badges", () => {
    render(<LeaderboardTable players={players} />);

    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("Player")).toBeInTheDocument();
    expect(screen.getByText("Wins")).toBeInTheDocument();
    expect(screen.getByText("ETH won")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Rising Star")).toBeInTheDocument();
    expect(screen.getByText("12500XP")).toBeInTheDocument();
    expect(screen.getByText("Morgan")).toBeInTheDocument();
    expect(screen.getByText("9000XP")).toBeInTheDocument();
  });

  it("highlights the current player and second place, and uses transparent background for other ranks", () => {
    const playersWithThird: Player[] = [
      ...players,
      {
        id: "player-3",
        name: "Alex",
        rank: 3,
        wins: 4,
        xpWon: 5000,
        badges: [
          { id: "streak", name: "Hot Streak", icon: "fire", color: "red" },
          { id: "vet", name: "Veteran", icon: "shield", color: "blue" },
          { id: "custom", name: "Custom Badge", icon: "custom", color: "yellow" },
        ],
      },
    ];
    const { container } = render(<LeaderboardTable players={playersWithThird} />);

    expect(screen.getByText("You").closest(".grid-cols-4")).toHaveClass("bg-yellow-500/20");
    expect(screen.getByText("Morgan").closest(".grid-cols-4")).toHaveClass("bg-purple-500/20");
    expect(screen.getByText("Alex").closest(".grid-cols-4")).toHaveClass("bg-transparent");
    expect(screen.getByText("Hot Streak")).toBeInTheDocument();
    expect(screen.getByText("Veteran")).toBeInTheDocument();
    expect(screen.getByText("Custom Badge")).toBeInTheDocument();
    expect(container.querySelectorAll(".divide-y > div")).toHaveLength(3);
  });

  it("renders empty table without errors when no players are passed", () => {
    const { container } = render(<LeaderboardTable players={[]} />);
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(container.querySelectorAll(".divide-y > div")).toHaveLength(0);
  });
});