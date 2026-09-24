import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RaffleNotificationCard from "./RaffleNotificationCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

vi.mock("../NotificationSubscribeButton", () => ({
  default: ({ raffleId }: { raffleId: number }) => (
    <button data-testid="subscribe-btn">Subscribe to raffle {raffleId}</button>
  ),
}));

describe("RaffleNotificationCard", () => {
  it("renders the subscribe button", () => {
    render(<RaffleNotificationCard raffleId={42} />);
    expect(screen.getByTestId("subscribe-btn")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to raffle 42")).toBeInTheDocument();
  });

  it("renders the bell icon section", () => {
    const { container } = render(<RaffleNotificationCard raffleId={1} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
