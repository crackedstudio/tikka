import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import ShareRaffle from "./ShareRaffle";

describe("ShareRaffle", () => {
  it("renders share this raffle heading", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    expect(screen.getByText("Share This Raffle")).toBeTruthy();
  });

  it("renders Twitter share link", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const link = screen.getByRole("link", { name: /share on x \(twitter\)/i });
    expect(link).toBeTruthy();
  });

  it("renders Telegram share link", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const link = screen.getByRole("link", { name: /share on telegram/i });
    expect(link).toBeTruthy();
  });

  it("renders copy link button", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const button = screen.getByRole("button", { name: /copy raffle link/i });
    expect(button).toBeTruthy();
  });

  it("renders QR code section", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    expect(screen.getByText("QR Code")).toBeTruthy();
  });

  it("renders download QR button", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const button = screen.getByRole("button", { name: /download qr code/i });
    expect(button).toBeTruthy();
  });

  it("Twitter link points to twitter.com", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const link = screen.getByRole("link", { name: /share on x \(twitter\)/i });
    const href = link.getAttribute("href") || "";
    expect(href.includes("twitter.com")).toBe(true);
  });

  it("Telegram link points to t.me", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const link = screen.getByRole("link", { name: /share on telegram/i });
    const href = link.getAttribute("href") || "";
    expect(href.includes("t.me")).toBe(true);
  });

  it("has proper link attributes", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    const twitterLink = screen.getByRole("link", { name: /share on x \(twitter\)/i });
    expect(twitterLink.getAttribute("target")).toBe("_blank");
    expect(twitterLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders invitation text", () => {
    render(React.createElement(ShareRaffle, { raffleId: 1, title: "Test Raffle" }));
    expect(screen.getByText(/invite your friends/i)).toBeTruthy();
  });
});
