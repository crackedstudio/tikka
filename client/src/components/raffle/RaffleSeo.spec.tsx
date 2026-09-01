import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import RaffleSeo from "./RaffleSeo";

vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <div data-testid="helmet">{children}</div>,
}));

const props = {
  title: "Test Raffle",
  description: "A test raffle",
  image: "https://example.com/img.png",
};

describe("RaffleSeo", () => {
  it("renders without crashing", () => {
    const { container } = render(<RaffleSeo {...props} />);
    expect(container).toBeTruthy();
  });
});
