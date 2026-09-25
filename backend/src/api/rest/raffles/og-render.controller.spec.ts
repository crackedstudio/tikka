import { Test, TestingModule } from "@nestjs/testing";
import sharp from "sharp";
import { OgRenderController } from "./og-render.controller";
import { RaffleOgImageService } from "./raffle-og-image.service";

jest.mock("sharp", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockSharp = sharp as unknown as jest.Mock;

function createReply() {
  const reply = {
    status: jest.fn(),
    header: jest.fn(),
    send: jest.fn(),
    redirect: jest.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  reply.redirect.mockReturnValue(reply);
  return reply;
}

describe("OgRenderController", () => {
  let controller: OgRenderController;

  beforeEach(async () => {
    mockSharp.mockImplementation(() => ({
      png: () => ({
        toBuffer: jest.fn().mockResolvedValue(Buffer.from("default-png")),
      }),
    }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OgRenderController],
      providers: [RaffleOgImageService],
    }).compile();

    controller = module.get(OgRenderController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("paints /og/default.png with the shared image service", async () => {
    const reply = createReply();
    await controller.getDefaultOgImage(reply as never);

    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(reply.send).toHaveBeenCalledWith(Buffer.from("default-png"));

    const svg = (mockSharp.mock.calls.at(-1)?.[0] as Buffer).toString("utf8");
    expect(svg).toContain("Tikka Raffles");
    expect(svg).not.toContain("<!DOCTYPE html");
  });

  it("301s the legacy /og/raffles/:id URL to the canonical image", () => {
    const reply = createReply();
    controller.redirectLegacyRaffleOg("42", reply as never);

    expect(reply.redirect).toHaveBeenCalledWith("/raffles/42/og", 301);
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "public, max-age=86400");
    expect(mockSharp).not.toHaveBeenCalled();
  });

  it("encodes the raffle id so a cached legacy URL cannot redirect off-host", () => {
    const reply = createReply();
    controller.redirectLegacyRaffleOg("https://evil.example", reply as never);

    expect(reply.redirect).toHaveBeenCalledWith(
      "/raffles/https%3A%2F%2Fevil.example/og",
      301,
    );
  });
});
