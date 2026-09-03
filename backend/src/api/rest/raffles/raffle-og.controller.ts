import { Controller, Get, Header, Param, ParseIntPipe, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../../auth/decorators/public.decorator";
import { RafflesService } from "./raffles.service";
import { MetadataRedisService } from "../../../services/metadata-redis.service";
import { RaffleOgImageService } from "./raffle-og-image.service";

@ApiTags("Raffles")
@Controller("raffles")
export class RaffleOgController {
  constructor(
    private readonly rafflesService: RafflesService,
    private readonly metadataRedis: MetadataRedisService,
    private readonly ogImageService: RaffleOgImageService,
  ) {}

  /**
   * GET /raffles/:id/og — Returns a dynamic Open Graph image (PNG) for the raffle.
   */
  @Public()
  @Get(":id/og")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=60")
  async getRaffleOgImage(
    @Param("id", ParseIntPipe) id: number,
    @Res() reply: any,
  ): Promise<void> {
    const cacheKey = `og:raffle:${id}`;

    if (this.metadataRedis.isEnabled()) {
      const cached = await this.metadataRedis.get(cacheKey);
      if (cached) {
        const buffer = Buffer.from(cached, "base64");
        reply.status(200).send(buffer);
        return;
      }
    }

    let raffle;
    try {
      raffle = await this.rafflesService.getById(id);
    } catch {
      const defaultBuffer = await this.ogImageService.generateDefaultOgImage();
      reply.status(200).send(defaultBuffer);
      return;
    }

    const title = raffle.title || `Raffle #${raffle.id}`;
    const prize_amount = raffle.prize_amount || "10,000";
    const tickets_sold = raffle.tickets_sold || 0;
    const max_tickets = raffle.max_tickets || 100;
    const end_time = raffle.end_time || "";
    const image_url = raffle.image_url || "";

    let base64Image = "";
    if (image_url) {
      try {
        const res = await fetch(image_url);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const contentType = res.headers.get("content-type") || "image/png";
          base64Image = `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
        }
      } catch {
        // ignore image fetch error
      }
    }

    const pngBuffer = await this.ogImageService.renderOgImage(
      title,
      prize_amount,
      tickets_sold,
      max_tickets,
      end_time,
      base64Image,
    );

    if (this.metadataRedis.isEnabled()) {
      await this.metadataRedis.setEx(cacheKey, 60, pngBuffer.toString("base64"));
    }

    reply.status(200).send(pngBuffer);
  }
}
