/**
 * ImageStep Tests
 *
 * Covers the first wizard step that decides what the user is allowed to upload:
 *  - client-side validation (only image/* files are accepted)
 *  - the disabled/enabled state of the "Continue" advance control
 *  - the primary-image rules (first image wins, remove promotes the next)
 *  - back-navigation preserving the selected files
 *
 * The component is a controlled step: it never uploads. The actual upload
 * happens later through MetadataService.uploadMetadataWithImage (via
 * CreateRaffleButton), and the backend enforces the 5 MB / JPEG-PNG-WebP /
 * dimension limits in RaffleImagesController — see raffle-images.controller.spec.ts.
 */

import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ImageStep from "./ImageStep";
import type { RaffleFormData } from "../../types/forms";

const makeForm = (overrides: Partial<RaffleFormData> = {}): RaffleFormData => ({
  title: "",
  description: "",
  image: null,
  images: [],
  pricePerTicket: 0,
  totalTickets: 0,
  duration: { days: 0, hours: 0 },
  ...overrides,
});

const makeFile = (name: string, type: string, bytes = 8): File =>
  new File([new Uint8Array(bytes)], name, { type });

const renderStep = (formData: RaffleFormData) => {
  const updateFormData = vi.fn();
  const onNext = vi.fn();
  const onBack = vi.fn();
  const utils = render(
    <ImageStep
      formData={formData}
      updateFormData={updateFormData}
      onNext={onNext}
      onBack={onBack}
    />,
  );
  return { ...utils, updateFormData, onNext, onBack };
};

const fileInputOf = (container: HTMLElement): HTMLInputElement =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

const continueButton = () => screen.getByRole("button", { name: "Continue" });

/**
 * Minimal controlled parent mirroring how CreateRaffle owns formData. Used to
 * prove that leaving and returning to the step does not lose the selection.
 */
const StepHarness: React.FC<{ initial?: Partial<RaffleFormData> }> = ({
  initial,
}) => {
  const [formData, setFormData] = useState<RaffleFormData>(
    makeForm(initial),
  );
  const [visible, setVisible] = useState(true);

  return (
    <div>
      <button type="button" onClick={() => setVisible((v) => !v)}>
        toggle-step
      </button>
      {visible && (
        <ImageStep
          formData={formData}
          updateFormData={(data) =>
            setFormData((prev) => ({ ...prev, ...data }))
          }
          onNext={() => {}}
          onBack={() => {}}
        />
      )}
      <output data-testid="image-names">
        {formData.images.map((file) => file.name).join(",")}
      </output>
      <output data-testid="primary-name">{formData.image?.name ?? ""}</output>
    </div>
  );
};

describe("ImageStep", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:mock-image"),
      writable: true,
      configurable: true,
    });
  });

  describe("validation", () => {
    it("accepts an image and records it as both primary and gallery entry", () => {
      const { updateFormData, container } = renderStep(makeForm());
      const image = makeFile("prize.png", "image/png");

      fireEvent.change(fileInputOf(container), {
        target: { files: [image] },
      });

      expect(updateFormData).toHaveBeenCalledTimes(1);
      expect(updateFormData).toHaveBeenCalledWith({
        image,
        images: [image],
      });
    });

    it("rejects a non-image file (wrong MIME type)", () => {
      const { updateFormData, container } = renderStep(makeForm());

      fireEvent.change(fileInputOf(container), {
        target: { files: [makeFile("notes.txt", "text/plain")] },
      });

      expect(updateFormData).not.toHaveBeenCalled();
      expect(continueButton()).toBeDisabled();
    });

    it("keeps only the image files out of a mixed selection", () => {
      const { updateFormData, container } = renderStep(makeForm());
      const image = makeFile("prize.webp", "image/webp");

      fireEvent.change(fileInputOf(container), {
        target: {
          files: [
            makeFile("invoice.pdf", "application/pdf"),
            image,
            makeFile("script.js", "text/javascript"),
          ],
        },
      });

      expect(updateFormData).toHaveBeenCalledTimes(1);
      expect(updateFormData).toHaveBeenCalledWith({
        image,
        images: [image],
      });
    });

    it("appends extra images without replacing the current primary", () => {
      const primary = makeFile("front.png", "image/png");
      const second = makeFile("back.png", "image/png");
      const { updateFormData, container } = renderStep(
        makeForm({ image: primary, images: [primary] }),
      );

      fireEvent.change(fileInputOf(container), {
        target: { files: [second] },
      });

      expect(updateFormData).toHaveBeenCalledWith({
        images: [primary, second],
      });
    });

    it("applies no client-side size cap — the backend owns the 5 MB limit", () => {
      // RaffleImagesController rejects > MAX_UPLOAD_BYTES (5 MB) with a 413; the
      // step itself only filters by MIME, so a 6 MB image must still reach the
      // gallery instead of being silently dropped here.
      const { updateFormData, container } = renderStep(makeForm());
      const giant = makeFile("huge.png", "image/png", 6 * 1024 * 1024);

      expect(giant.size).toBeGreaterThan(5 * 1024 * 1024);

      fireEvent.change(fileInputOf(container), {
        target: { files: [giant] },
      });

      expect(updateFormData).toHaveBeenCalledWith({
        image: giant,
        images: [giant],
      });
    });
  });

  describe("advance control state", () => {
    it("disables Continue while no image is selected", () => {
      renderStep(makeForm());
      expect(continueButton()).toBeDisabled();
    });

    it("enables Continue once an image is present", () => {
      const image = makeFile("prize.jpg", "image/jpeg");
      renderStep(makeForm({ image, images: [image] }));
      expect(continueButton()).toBeEnabled();
    });

    it("does not advance while Continue is disabled", () => {
      const { onNext } = renderStep(makeForm());

      fireEvent.click(continueButton());

      expect(onNext).not.toHaveBeenCalled();
    });

    it("calls onNext when Continue is enabled", () => {
      const image = makeFile("prize.jpg", "image/jpeg");
      const { onNext } = renderStep(makeForm({ image, images: [image] }));

      fireEvent.click(continueButton());

      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("primary image and removal", () => {
    it("promotes the next image when the primary is removed", () => {
      const first = makeFile("first.png", "image/png");
      const second = makeFile("second.png", "image/png");
      const { updateFormData } = renderStep(
        makeForm({ image: first, images: [first, second] }),
      );

      fireEvent.click(screen.getByLabelText("Remove image 1"));

      expect(updateFormData).toHaveBeenCalledWith({
        image: second,
        images: [second],
      });
    });

    it("keeps the primary when a different image is removed", () => {
      const first = makeFile("first.png", "image/png");
      const second = makeFile("second.png", "image/png");
      const { updateFormData } = renderStep(
        makeForm({ image: first, images: [first, second] }),
      );

      fireEvent.click(screen.getByLabelText("Remove image 2"));

      expect(updateFormData).toHaveBeenCalledWith({ images: [first] });
    });

    it("clears the primary when the last image is removed", () => {
      const only = makeFile("only.png", "image/png");
      const { updateFormData } = renderStep(
        makeForm({ image: only, images: [only] }),
      );

      fireEvent.click(screen.getByLabelText("Remove image 1"));

      expect(updateFormData).toHaveBeenCalledWith({ image: null, images: [] });
    });

    it("lets the user promote any gallery image to primary", () => {
      const first = makeFile("first.png", "image/png");
      const second = makeFile("second.png", "image/png");
      const { updateFormData } = renderStep(
        makeForm({ image: first, images: [first, second] }),
      );

      fireEvent.click(screen.getByLabelText("Set image 2 as primary"));

      expect(updateFormData).toHaveBeenCalledWith({ image: second });
    });
  });

  describe("navigation", () => {
    it("calls onBack without touching the entered images", () => {
      const image = makeFile("prize.png", "image/png");
      const { onBack, updateFormData } = renderStep(
        makeForm({ image, images: [image] }),
      );

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(onBack).toHaveBeenCalledTimes(1);
      expect(updateFormData).not.toHaveBeenCalled();
    });

    it("preserves the selection when the step is left and re-entered", () => {
      render(<StepHarness />);

      fireEvent.change(fileInputOf(document.body), {
        target: { files: [makeFile("kept.png", "image/png")] },
      });
      expect(screen.getByTestId("image-names")).toHaveTextContent("kept.png");
      expect(screen.getByTestId("primary-name")).toHaveTextContent("kept.png");

      // Leave the step and come back — the wizard's parent state must survive.
      fireEvent.click(screen.getByRole("button", { name: "toggle-step" }));
      expect(screen.queryByTestId("image-names")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "toggle-step" }));

      expect(screen.getByTestId("image-names")).toHaveTextContent("kept.png");
      expect(screen.getByTestId("primary-name")).toHaveTextContent("kept.png");
    });
  });

  describe("rendering", () => {
    it("summarises how many images were uploaded", () => {
      const first = makeFile("first.png", "image/png");
      const second = makeFile("second.png", "image/png");
      renderStep(makeForm({ image: first, images: [first, second] }));

      expect(
        screen.getByText("2 images uploaded - Click to add more"),
      ).toBeInTheDocument();
    });

    it("supports dropping image files onto the upload zone", () => {
      const { updateFormData, container } = renderStep(makeForm());
      const image = makeFile("dropped.png", "image/png");

      fireEvent.drop(
        screen.getByRole("button", { name: "Upload prize images" }),
        { dataTransfer: { files: [image] } },
      );

      expect(updateFormData).toHaveBeenCalledWith({
        image,
        images: [image],
      });
      expect(fileInputOf(container)).toBeInTheDocument();
    });
  });
});
