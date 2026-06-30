import { Controller, Get, Param, ParseIntPipe, Res, Header } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { FastifyReply } from "fastify";
import { Public } from "../../../auth/decorators/public.decorator";
import { RafflesService, RaffleDetailResponse } from "./raffles.service";
import { ConfigService } from "@nestjs/config";
import { MetadataRedisService } from "../../../services/metadata-redis.service";
import * as sharp from "sharp";

/**
 * OG Pre-Render Controller
 *
 * Serves lightweight HTML pages containing Open Graph and Twitter Card meta tags
 * for social media crawlers.
 */
@ApiTags("OG Pre-Render")
@Controller("og")
export class OgRenderController {
  private readonly siteUrl: string;
  private readonly defaultOgImage: string;

  constructor(
    private readonly rafflesService: RafflesService,
    private readonly configService: ConfigService,
    private readonly metadataRedis: MetadataRedisService,
  ) {
    this.siteUrl =
      this.configService.get<string>("SITE_URL") ||
      this.configService.get<string>("VITE_FRONTEND_URL") ||
      "https://tikka.io";
    this.defaultOgImage = `${this.siteUrl}/og/default.png`;
  }

  /**
   * GET /og/default.png — Returns the static fallback OG image.
   */
  @Public()
  @Get("default.png")
  @Header("Content-Type", "image/png")
  @Header("Cache-Control", "public, max-age=86400")
  async getDefaultOgImage(@Res() reply: FastifyReply): Promise<void> {
    const buffer = await this.generateDefaultOgImage();
    reply.status(200).send(buffer);
  }

  /**
   * GET /og/raffles/:id — Returns a minimal HTML page with OG + Twitter Card
   * meta tags for the given raffle.
   */
  @Public()
  @Get("raffles/:id")
  @ApiOperation({
    summary: "Pre-render OG meta tags for a raffle (for social media crawlers)",
  })
  @ApiParam({ name: "id", description: "Raffle ID" })
  @Header("Cache-Control", "public, max-age=300, s-maxage=600")
  async renderRaffleOg(
    @Param("id", ParseIntPipe) id: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    let raffle: RaffleDetailResponse;

    try {
      raffle = await this.rafflesService.getById(id);
    } catch {
      // Raffle not found — return generic OG tags
      const html = this.buildHtml({
        title: "Raffle Not Found | Tikka",
        description:
          "This raffle could not be found. Explore more decentralized raffles on Tikka.",
        image: this.defaultOgImage,
        url: `${this.siteUrl}/raffles/${id}`,
      });

      reply.status(404).type("text/html; charset=utf-8").send(html);
      return;
    }

    const title = raffle.title || `Raffle #${raffle.id}`;
    const description =
      raffle.description ||
      "Join this raffle on Tikka — Decentralized Raffles on Stellar.";
    const image = `${this.siteUrl}/raffles/${id}/og`; // Point to our dynamic OG image!
    const url = `${this.siteUrl}/raffles/${id}`;

    const html = this.buildHtml({ title: `${title} | Tikka Raffles`, description, image, url });
    reply.status(200).type("text/html; charset=utf-8").send(html);
  }

  /**
   * Builds a minimal HTML page with OG + Twitter Card meta tags.
   */
  private buildHtml(meta: {
    title: string;
    description: string;
    image: string;
    url: string;
  }): string {
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}" />

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.description)}" />
  <meta property="og:image" content="${esc(meta.image)}" />
  <meta property="og:url" content="${esc(meta.url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Tikka" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.description)}" />
  <meta name="twitter:image" content="${esc(meta.image)}" />
  <meta name="twitter:site" content="@tikaborofficial" />

  <!-- Redirect real users to the SPA -->
  <meta http-equiv="refresh" content="0;url=${esc(meta.url)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(meta.url)}">${esc(meta.title)}</a>…</p>
</body>
</html>`;
  }

  private async generateDefaultOgImage(): Promise<Buffer> {
    const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0c"/>
      <stop offset="50%" stop-color="#111115"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
  </defs>
  
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1100" cy="100" r="300" fill="#6366f1" opacity="0.05" />
  <circle cx="100" cy="500" r="200" fill="#ec4899" opacity="0.03" />

  <g transform="translate(80, 80)">
    <rect width="40" height="40" rx="8" fill="#6366f1" />
    <text x="20" y="27" text-anchor="middle" fill="#ffffff" font-size="20" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900">T</text>
    <text x="55" y="28" fill="#ffffff" font-size="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold" letter-spacing="1">tikka</text>
  </g>

  <text x="80" y="240" fill="#ffffff" font-size="64" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">Decentralized Raffles</text>
  <text x="80" y="320" fill="#a5b4fc" font-size="36" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="600">Built on Stellar Blockchain</text>

  <g transform="translate(730, 120)">
    <rect width="390" height="390" rx="30" ry="30" fill="#18181b" stroke="#27272a" stroke-width="3" />
    <text x="195" y="220" text-anchor="middle" fill="#6366f1" font-size="100" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">🎟️</text>
  </g>
</svg>`;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }
}
