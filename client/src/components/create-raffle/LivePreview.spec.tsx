/**
 * Tests for LivePreview component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LivePreview from "./LivePreview";
import type { RaffleFormData } from "../../types/types";

describe("LivePreview", () => {
  beforeEach(() => {
    // Mock URL.createObjectURL
    global.URL = {
      createObjectURL: vi.fn(() => "mock-url"),
      revokeObjectURL: vi.fn(),
    } as any;
  });

  it("renders with empty form data without console errors", () => {
    const emptyData: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    const consoleSpy = vi.spyOn(console, "error");
    render(<LivePreview formData={emptyData} />);
    
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByText("Raffle title not set")).toBeInTheDocument();
    expect(screen.getByText("No description provided")).toBeInTheDocument();
    expect(screen.getByText("Creator not set")).toBeInTheDocument();
    expect(screen.getByText("Duration not set")).toBeInTheDocument();
    expect(screen.getByText("Close time not set")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Price not set")).toBeInTheDocument();
    expect(screen.getByText("Join Raffle")).toBeInTheDocument();
    
    // Filter out React deprecation warnings
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => !call[0].includes("ReactDOMTestUtils.act")
    );
    expect(errorCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it("renders with partial form data without console errors", () => {
    const partialData: RaffleFormData = {
      title: "My Raffle",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 10,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    const consoleSpy = vi.spyOn(console, "error");
    render(<LivePreview formData={partialData} />);
    
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByText("My Raffle")).toBeInTheDocument();
    expect(screen.getByText("No description provided")).toBeInTheDocument();
    expect(screen.getByText("Creator not set")).toBeInTheDocument();
    expect(screen.getByText("Duration not set")).toBeInTheDocument();
    expect(screen.getByText("Close time not set")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("Join Raffle")).toBeInTheDocument();
    
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => !call[0].includes("ReactDOMTestUtils.act")
    );
    expect(errorCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it("renders with complete form data without console errors", () => {
    const mockFile = new File([""], "image.jpg", { type: "image/jpeg" });
    const completeData: RaffleFormData = {
      title: "My Raffle",
      description: "This is a raffle",
      image: mockFile,
      images: [mockFile],
      pricePerTicket: 10,
      totalTickets: 100,
      duration: { days: 7, hours: 0 },
    };

    const consoleSpy = vi.spyOn(console, "error");
    render(<LivePreview formData={completeData} />);
    
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByText("My Raffle")).toBeInTheDocument();
    expect(screen.getByText("This is a raffle")).toBeInTheDocument();
    expect(screen.getByText("Creator not set")).toBeInTheDocument();
    expect(screen.getByText("7d 0h")).toBeInTheDocument();
    expect(screen.getByText("Close time not set")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("Join Raffle")).toBeInTheDocument();
    
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => !call[0].includes("ReactDOMTestUtils.act")
    );
    expect(errorCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it("renders with only title set", () => {
    const data: RaffleFormData = {
      title: "Test Raffle",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    render(<LivePreview formData={data} />);
    
    expect(screen.getByText("Test Raffle")).toBeInTheDocument();
    expect(screen.getByText("No description provided")).toBeInTheDocument();
  });

  it("renders with only description set", () => {
    const data: RaffleFormData = {
      title: "",
      description: "Test description",
      image: null,
      images: [],
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    render(<LivePreview formData={data} />);
    
    expect(screen.getByText("Raffle title not set")).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
  });

  it("renders with only duration set", () => {
    const data: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 5, hours: 3 },
    };

    render(<LivePreview formData={data} />);
    
    expect(screen.getByText("5d 3h")).toBeInTheDocument();
  });

  it("renders with only price set", () => {
    const data: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 25.5,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    render(<LivePreview formData={data} />);
    
    expect(screen.getByText("$25.50")).toBeInTheDocument();
  });

  it("renders with only tickets set", () => {
    const data: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: [],
      pricePerTicket: 0,
      totalTickets: 500,
      duration: { days: 0, hours: 0 },
    };

    render(<LivePreview formData={data} />);
    
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it("renders with multiple images", () => {
    const mockFile1 = new File([""], "image1.jpg", { type: "image/jpeg" });
    const mockFile2 = new File([""], "image2.jpg", { type: "image/jpeg" });
    const data: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: [mockFile1, mockFile2],
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    const consoleSpy = vi.spyOn(console, "error");
    render(<LivePreview formData={data} />);
    
    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => !call[0].includes("ReactDOMTestUtils.act")
    );
    expect(errorCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it("renders with more than 4 images", () => {
    const mockFiles = Array.from({ length: 5 }, (_, i) =>
      new File([""], `image${i}.jpg`, { type: "image/jpeg" })
    );
    const data: RaffleFormData = {
      title: "",
      description: "",
      image: null,
      images: mockFiles,
      pricePerTicket: 0,
      totalTickets: 0,
      duration: { days: 0, hours: 0 },
    };

    const consoleSpy = vi.spyOn(console, "error");
    render(<LivePreview formData={data} />);

    const errorCalls = consoleSpy.mock.calls.filter(
      (call) => !call[0].includes("ReactDOMTestUtils.act")
    );
    expect(errorCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  describe("dark mode", () => {
    beforeEach(() => {
      document.documentElement.classList.add("dark");
    });

    afterEach(() => {
      document.documentElement.classList.remove("dark");
    });

    it("snapshot — empty form in dark mode", () => {
      const emptyData: RaffleFormData = {
        title: "",
        description: "",
        image: null,
        images: [],
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
      };
      const { asFragment } = render(<LivePreview formData={emptyData} />);
      expect(asFragment()).toMatchSnapshot();
    });

    it("snapshot — complete form in dark mode", () => {
      const mockFile = new File([""], "image.jpg", { type: "image/jpeg" });
      const completeData: RaffleFormData = {
        title: "My Raffle",
        description: "A fantastic prize",
        image: mockFile,
        images: [mockFile],
        pricePerTicket: 10,
        totalTickets: 100,
        duration: { days: 7, hours: 0 },
      };
      const { asFragment } = render(<LivePreview formData={completeData} />);
      expect(asFragment()).toMatchSnapshot();
    });

    it("contains dark mode class variants for backgrounds and text", () => {
      const emptyData: RaffleFormData = {
        title: "",
        description: "",
        image: null,
        images: [],
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
      };
      const { container } = render(<LivePreview formData={emptyData} />);
      const html = container.innerHTML;
      expect(html).toContain("dark:bg-[#1E1932]");
      expect(html).toContain("dark:text-white");
      expect(html).toContain("dark:bg-gray-700");
    });

    it("overflow counter has both light and dark bg classes", () => {
      const mockFiles = Array.from({ length: 5 }, (_, i) =>
        new File([""], `image${i}.jpg`, { type: "image/jpeg" })
      );
      const data: RaffleFormData = {
        title: "",
        description: "",
        image: null,
        images: mockFiles,
        pricePerTicket: 0,
        totalTickets: 0,
        duration: { days: 0, hours: 0 },
      };
      const { container } = render(<LivePreview formData={data} />);
      const html = container.innerHTML;
      expect(html).toContain("bg-gray-200");
      expect(html).toContain("dark:bg-gray-700");
    });
  });
});
