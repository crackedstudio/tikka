import { Controller, Get, Param, ParseIntPipe, Res, Header } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { FastifyReply } from "fastify";
import { Public } from "../../../auth/decorators/public.decorator";
import { RafflesService, RaffleDetailResponse } from "./raffles.service";
import { ConfigService } from "@nestjs/config";

/**
 * OG Pre-Render Controller
 *
 * Serves lightweight HTML pages containing Open Graph and Twitter Card meta tags
 * for social media crawlers (Twitter, Discord, Telegram, Facebook) that do NOT
 * execute JavaScript. These crawlers hit this endpoint and receive a page with
 * proper meta tags, then a meta-refresh redirect sends real users to the SPA.
 *
 * The frontend or a reverse proxy (Nginx/Cloudflare Worker) should route
 * crawler user-agents to GET /og/raffles/:id instead of serving the SPA directly.
 *
 * @see https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
 * @see https://ogp.me/
 */
@ApiTags("OG Pre-Render")
@Controller("og")
export class OgRenderController {
  private readonly siteUrl: string;
  private readonly defaultOgImage: string;

  constructor(
    private readonly rafflesService: RafflesService,
    private readonly configService: ConfigService,
  ) {
    this.siteUrl =
      this.configService.get<string>("SITE_URL") ||
      this.configService.get<string>("VITE_FRONTEND_URL") ||
      "https://tikka.io";
    this.defaultOgImage = `${this.siteUrl}/og-image.png`;
  }

  /**
   * GET /og/raffles/:id — Returns a minimal HTML page with OG + Twitter Card
   * meta tags for the given raffle. Crawlers read the meta; real users get
   * redirected to the SPA via <meta http-equiv="refresh">.
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
    const image = raffle.image_url || this.defaultOgImage;
    const url = `${this.siteUrl}/raffles/${id}`;

    const html = this.buildHtml({ title: `${title} | Tikka Raffles`, description, image, url });
    reply.status(200).type("text/html; charset=utf-8").send(html);
  }

  /**
   * Builds a minimal HTML page with OG + Twitter Card meta tags.
   * Includes a meta-refresh redirect to send real users to the SPA.
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
}
