import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import sharp from "sharp";
import { MetadataRedisService } from "../../../services/metadata/metadata-redis.service";
import { RaffleOgController } from "./raffle-og.controller";
import { RaffleOgImageService } from "./raffle-og-image.service";
import { RafflesService } from "./raffles.service";

// The controller only needs the class as a DI token. Loading the real service
// pulls in unrelated modules with pre-existing broken imports.
jest.mock("./raffles.service", () => ({
  RafflesService: class RafflesService {},
}));

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
  };
  reply.status.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  return reply;
}

function svgFromLastSharpCall(): string {
  const input = mockSharp.mock.calls.at(-1)?.[0] as Buffer | undefined;
  return input ? input.toString("utf8") : "";
}

describe("RaffleOgController", () => {
  let controller: RaffleOgController;
  let rafflesService: { getById: jest.Mock };
  let metadataRedis: {
    isEnabled: jest.Mock;
    get: jest.Mock;
    setEx: jest.Mock;
  };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    mockSharp.mockImplementation(() => ({
      png: () => ({
        toBuffer: jest.fn().mockResolvedValue(Buffer.from("png-bytes")),
      }),
    }));

    rafflesService = { getById: jest.fn() };
    metadataRedis = {
      isEnabled: jest.fn().mockReturnValue(false),
      get: jest.fn(),
      setEx: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RaffleOgController],
      providers: [
        RaffleOgImageService,
        { provide: RafflesService, useValue: rafflesService },
        { provide: MetadataRedisService, useValue: metadataRedis },
      ],
    }).compile();

    controller = module.get(RaffleOgController);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it("renders a PNG card for a valid raffle, embedding its metadata image", async () => {
    rafflesService.getById.mockResolvedValue({
      id: 7,
      title: "Golden Ticket",
      prize_amount: "250",
      tickets_sold: 10,
      max_tickets: 40,
      end_time: String(Math.floor(Date.now() / 1000) + 86_400),
      image_url: "https://cdn.example.com/raffle.png",
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    }) as unknown as typeof fetch;

    const reply = createReply();
    await controller.getRaffleOgImage(7, reply as never);

    expect(rafflesService.getById).toHaveBeenCalledWith(7);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://cdn.example.com/raffle.png",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(reply.send).toHaveBeenCalledWith(Buffer.from("png-bytes"));

    const svg = svgFromLastSharpCall();
    expect(svg).toContain("Golden Ticket");
    expect(svg).toContain("250 XLM");
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).not.toContain("<!DOCTYPE html");
  });

  it("returns the shared default card when the raffle is missing", async () => {
    rafflesService.getById.mockRejectedValue(new NotFoundException("Raffle 99 not found"));
    global.fetch = jest.fn() as unknown as typeof fetch;

    const reply = createReply();
    await controller.getRaffleOgImage(99, reply as never);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(metadataRedis.setEx).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(reply.send).toHaveBeenCalledWith(expect.any(Buffer));

    const svg = svgFromLastSharpCall();
    expect(svg).toContain("Tikka Raffles");
    expect(svg).toContain("Decentralized");
    expect(svg).not.toContain("data:image/");
  });

  it("still renders a card when the metadata image is unavailable", async () => {
    rafflesService.getById.mockResolvedValue({
      id: 3,
      title: "No Photo Raffle",
      prize_amount: "15",
      tickets_sold: 1,
      max_tickets: 20,
      end_time: "",
      image_url: "https://cdn.example.com/missing.png",
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    }) as unknown as typeof fetch;

    const reply = createReply();
    await controller.getRaffleOgImage(3, reply as never);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://cdn.example.com/missing.png",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith(Buffer.from("png-bytes"));

    const svg = svgFromLastSharpCall();
    expect(svg).toContain("No Photo Raffle");
    expect(svg).toContain("🎟️");
    expect(svg).not.toContain("data:image/");
    expect(svg).not.toContain("https://cdn.example.com/missing.png");
  });

  it("still renders a card when the metadata image request fails", async () => {
    rafflesService.getById.mockResolvedValue({
      id: 8,
      title: "Unreachable Photo",
      image_url: "https://cdn.example.com/down.png",
    });
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const reply = createReply();
    await controller.getRaffleOgImage(8, reply as never);

    expect(reply.status).toHaveBeenCalledWith(200);
    const svg = svgFromLastSharpCall();
    expect(svg).toContain("Unreachable Photo");
    expect(svg).not.toContain("data:image/");
  });
});
