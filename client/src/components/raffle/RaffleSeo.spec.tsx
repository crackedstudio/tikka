import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import RaffleSeo from "./RaffleSeo";

vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div data-testid="helmet">{children}</div>,
}));

const props = {
  raffleId: 42,
  title: "Test Raffle",
  description: "A test raffle",
};

describe("RaffleSeo", () => {
  it("renders without crashing", () => {
    const { container } = render(<RaffleSeo {...props} />);
    expect(container).toBeTruthy();
  });

  it("advertises only the canonical raffle OG image", () => {
    const { container } = render(<RaffleSeo {...props} />);
    const expected = "http://localhost:3001/raffles/42/og";
    // React 19 hoists <meta> into document head, so read from the document.
    const markup = `${container.innerHTML}\n${document.head.innerHTML}\n${document.body.innerHTML}`;

    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      expected,
    );
    expect(document.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(
      expected,
    );
    expect(markup).not.toContain("/og/raffles/");
    expect(markup).not.toContain("/og-image.png");
  });
});
