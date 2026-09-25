import { Controller, Get, Header, Param, ParseIntPipe, Res } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FastifyReply } from "fastify";
import { Public } from "../../../auth/decorators/public.decorator";
import { MetadataRedisService } from "../../../services/metadata/metadata-redis.service";
import { RaffleOgImageService } from "./raffle-og-image.service";
import { RafflesService } from "./raffles.service";

/**
 * Canonical raffle Open Graph image.
 *
 * GET /raffles/:id/og is the only public raffle social-card image. The legacy
 * crawler URL GET /og/raffles/:id permanently redirects here.
 */
@ApiTags("Raffles")
@Controller("raffles")
export class RaffleOgController {
  constructor(
    private readonly rafflesService: RafflesService,
    private readonly metadataRedis: MetadataRedisService,
    private readonly ogImageService: RaffleOgImageService,
  ) {}

  /**
   * GET /raffles/:id/og — dynamic Open Graph image (PNG) for the raffle.
   * Missing raffles still return a PNG (the shared default card) so scrapers
   * always cache an image rather than an error page.
   */
  @Public()
  @Get(":id/og")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=60")
  @ApiOperation({ summary: "Dynamic Open Graph image for a raffle" })
  @ApiParam({ name: "id", description: "Raffle ID" })
  @ApiProduces("image/png")
  @ApiResponse({ status: 200, description: "PNG Open Graph image" })
  async getRaffleOgImage(
    @Param("id", ParseIntPipe) id: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const cacheKey = `og:raffle:${id}`;

    if (this.metadataRedis.isEnabled()) {
      const cached = await this.metadataRedis.get(cacheKey);
      if (cached) {
        this.sendPng(reply, Buffer.from(cached, "base64"));
        return;
      }
    }

    let pngBuffer: Buffer;
    let cacheable = true;
    try {
      const raffle = await this.rafflesService.getById(id);
      pngBuffer = await this.ogImageService.renderForRaffle(raffle);
    } catch {
      pngBuffer = await this.ogImageService.generateDefaultOgImage();
      // Don't pin the fallback — the raffle may be created moments later.
      cacheable = false;
    }

    if (cacheable && this.metadataRedis.isEnabled()) {
      await this.metadataRedis.setEx(cacheKey, 60, pngBuffer.toString("base64"));
    }

    this.sendPng(reply, pngBuffer);
  }

  private sendPng(reply: FastifyReply, pngBuffer: Buffer): void {
    reply
      .status(200)
      .header("Content-Type", "image/png")
      .header("Cache-Control", "public, max-age=60")
      .send(pngBuffer);
  }
}
