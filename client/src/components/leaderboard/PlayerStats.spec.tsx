import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlayerStats from "./PlayerStats";
import type { Achievement, PlayerStats as PlayerStatsData } from "../../types/leaderboard";

const stats: PlayerStatsData = {
  name: "Avery",
  joinedDate: "Joined March 2025",
  tickets: 42,
  wins: 7,
  level: 4,
  currentXp: 250,
  nextLevelXp: 1000,
  dailyStreak: 3,
  streakDays: [true, true, false, true, false, false, false],
};

const achievements: Achievement[] = [
  { id: "first-win", name: "First Win", icon: "trophy", color: "yellow" },
  { id: "tickets", name: "Ticket Taker", icon: "ticket", color: "teal" },
];

describe("PlayerStats", () => {
  it("renders player totals, level progress, streak, and achievements", () => {
    const { container } = render(<PlayerStats stats={stats} achievements={achievements} />);

    expect(screen.getByText("Avery")).toBeInTheDocument();
    expect(screen.getByText("42 Tickets")).toBeInTheDocument();
    expect(screen.getByText("7 Wins")).toBeInTheDocument();
    expect(screen.getByText("Level 4")).toBeInTheDocument();
    expect(screen.getByText("250/1000 XP")).toBeInTheDocument();
    expect(screen.getByText("3 Days")).toBeInTheDocument();
    expect(screen.getByText("First Win")).toBeInTheDocument();
    expect(screen.getByText("Ticket Taker")).toBeInTheDocument();
    expect(container.querySelector(".bg-gradient-to-r")?.getAttribute("style")).toContain("25%");
  });

  it("collapses and restores the player details", () => {
    render(<PlayerStats stats={stats} achievements={achievements} />);

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.queryByText("Avery")).not.toBeInTheDocument();
    expect(screen.getByText("Player Stats")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Avery")).toBeInTheDocument();
  });

  it("renders share and unknown achievement icons and purple styling", () => {
    const customAchievements: Achievement[] = [
      { id: "viral", name: "Social Butterfly", icon: "share", color: "purple" },
      { id: "mystery", name: "Mystery Badge", icon: "unknown_icon", color: "other" },
    ];

    render(<PlayerStats stats={stats} achievements={customAchievements} />);

    expect(screen.getByText("Social Butterfly")).toBeInTheDocument();
    expect(screen.getByText("Mystery Badge")).toBeInTheDocument();
    expect(screen.getByText("Claim 25 XP Bonus!")).toBeInTheDocument();
  });

  it("correctly renders streak day indicators with checkmarks and day letters", () => {
    render(<PlayerStats stats={stats} achievements={[]} />);

    // streakDays: [true, true, false, true, false, false, false]
    // 3 true -> 3 "✓"
    const checkmarks = screen.getAllByText("✓");
    expect(checkmarks).toHaveLength(3);

    // Days false: Wed ("W"), Fri ("F"), Sat ("S"), Sun ("S")
    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("F")).toBeInTheDocument();
  });
});