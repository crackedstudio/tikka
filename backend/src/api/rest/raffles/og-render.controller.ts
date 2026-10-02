import { Controller, Get, Header, Param, Res } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FastifyReply } from "fastify";
import { Public } from "../../../auth/decorators/public.decorator";
import { canonicalRaffleOgPath, RaffleOgImageService } from "./raffle-og-image.service";

/**
 * Legacy Open Graph URLs.
 *
 * Raffle social cards used to be reachable at both GET /og/raffles/:id (HTML
 * pre-render) and GET /raffles/:id/og (PNG). Scrapers cache whichever URL a
 * page advertises, so the HTML URL is a permanent redirect onto the single
 * image endpoint. Rendering lives entirely in RaffleOgImageService.
 */
@ApiTags("OG Pre-Render")
@Controller("og")
export class OgRenderController {
  constructor(private readonly ogImageService: RaffleOgImageService) {}

  /**
   * GET /og/default.png — generic brand fallback, painted by the shared service.
   */
  @Public()
  @Get("default.png")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=86400")
  @ApiOperation({ summary: "Generic fallback Open Graph image" })
  @ApiResponse({ status: 200, description: "PNG image" })
  async getDefaultOgImage(@Res() reply: FastifyReply): Promise<void> {
    const buffer = await this.ogImageService.generateDefaultOgImage();
    reply
      .status(200)
      .header("Content-Type", "image/png")
      .header("Cache-Control", "public, max-age=86400")
      .send(buffer);
  }

  /**
   * GET /og/raffles/:id — legacy crawler URL. 301 because production bot
   * rewrites (and any scraper that already fetched this URL) may have cached it.
   */
  @Public()
  @Get("raffles/:id")
  @ApiOperation({
    summary: "Redirect legacy raffle OG URL to the canonical image",
  })
  @ApiParam({ name: "id", description: "Raffle ID" })
  @ApiResponse({
    status: 301,
    description: "Permanent redirect to /raffles/:id/og",
  })
  redirectLegacyRaffleOg(@Param("id") id: string, @Res() reply: FastifyReply): void {
    reply
      .header("Cache-Control", "public, max-age=86400")
      .redirect(canonicalRaffleOgPath(id), 301);
  }
}
