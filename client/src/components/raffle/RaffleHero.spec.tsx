import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RaffleHero from "./RaffleHero";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("../LazyImage", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("../../assets/detailimage.png", () => ({ default: "placeholder.png" }));

const renderHero = (props: Partial<Parameters<typeof RaffleHero>[0]> = {}) =>
  render(
    <MemoryRouter>
      <RaffleHero title="Test Raffle" isActive={true} isFinalized={false} {...props} />
    </MemoryRouter>,
  );

describe("RaffleHero", () => {
  it("renders the raffle title as alt text", () => {
    renderHero({ title: "My Raffle" });
    expect(screen.getByAltText("My Raffle")).toBeInTheDocument();
  });

  it("shows live badge when active", () => {
    renderHero({ isActive: true });
    expect(screen.getByText("raffle.liveNow")).toBeInTheDocument();
  });

  it("shows finalized badge when finalized", () => {
    renderHero({ isActive: false, isFinalized: true });
    expect(screen.getByText("raffle.finalized")).toBeInTheDocument();
  });

  it("shows ended badge when neither active nor finalized", () => {
    renderHero({ isActive: false, isFinalized: false });
    expect(screen.getByText("raffle.ended")).toBeInTheDocument();
  });
});
