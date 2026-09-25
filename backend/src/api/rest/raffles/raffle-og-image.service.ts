import { Injectable } from "@nestjs/common";
import sharp from "sharp";

/** Fields required to paint a raffle social card. */
export interface RaffleOgCardInput {
  id: number;
  title?: string | null;
  prize_amount?: string | null;
  tickets_sold?: number | null;
  max_tickets?: number | null;
  end_time?: string | null;
  image_url?: string | null;
  image_urls?: string[] | null;
}

/**
 * Canonical path for a raffle Open Graph image.
 * Client meta tags and the legacy /og/raffles/:id redirect must use this path
 * so scrapers share a single cache key.
 */
export function canonicalRaffleOgPath(id: string | number): string {
  return `/raffles/${encodeURIComponent(String(id))}/og`;
}

@Injectable()
export class RaffleOgImageService {
  async generateDefaultOgImage(): Promise<Buffer> {
    return this.renderOgImage("Tikka Raffles", "Decentralized", 0, 100, "", "");
  }

  /**
   * Render the card for a raffle. A missing or unfetchable metadata image
   * falls back to the ticket placeholder — it does not fail the card.
   */
  async renderForRaffle(raffle: RaffleOgCardInput): Promise<Buffer> {
    const base64Image = await this.loadMetadataImage(this.resolveMetadataImageUrl(raffle));
    return this.renderOgImage(
      raffle.title || `Raffle #${raffle.id}`,
      raffle.prize_amount || "10,000",
      raffle.tickets_sold || 0,
      raffle.max_tickets || 100,
      raffle.end_time || "",
      base64Image,
    );
  }

  async renderOgImage(
    title: string,
    prize_amount: string,
    tickets_sold: number,
    max_tickets: number,
    end_time: string,
    base64Image: string,
  ): Promise<Buffer> {
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const words = title.split(" ");
    let line1 = "";
    let line2 = "";
    for (const word of words) {
      if ((line1 + " " + word).length < 25) {
        line1 = (line1 + " " + word).trim();
      } else if ((line2 + " " + word).length < 25) {
        line2 = (line2 + " " + word).trim();
      } else {
        if (line2) {
          line2 = line2 + "...";
          break;
        }
        line2 = word;
      }
    }
    if (!line1) {
      line1 = title;
    }

    const sold = tickets_sold;
    const max = max_tickets || 1;
    const percent = Math.min(1, sold / max);
    const fillWidth = Math.round(580 * percent);

    const parseEndTime = (endTimeStr?: string): string => {
      if (!endTimeStr) return "No end time";
      const endTime = parseInt(endTimeStr, 10);
      if (isNaN(endTime) || endTime === 0) return "No end time";
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) return "Ended";
      const days = Math.floor(diff / 86400);
      if (days > 0) return `${days}d left`;
      const hours = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      return `${hours}h ${minutes}m left`;
    };

    const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0c"/>
      <stop offset="50%" stop-color="#111115"/>
      <stop offset="100%" stop-color="#1c1917"/>
    </linearGradient>
    <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="rect-clip">
      <rect x="730" y="100" width="390" height="390" rx="30" ry="30" />
    </clipPath>
  </defs>
  
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1100" cy="100" r="300" fill="#6366f1" opacity="0.05" />
  <circle cx="100" cy="500" r="200" fill="#ec4899" opacity="0.03" />

  <g transform="translate(80, 80)">
    <rect width="40" height="40" rx="8" fill="#6366f1" />
    <text x="20" y="27" text-anchor="middle" fill="#ffffff" font-size="20" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="900">T</text>
    <text x="55" y="28" fill="#ffffff" font-size="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold" letter-spacing="1">tikka</text>
  </g>

  <text x="80" y="210" fill="#ffffff" font-size="48" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${esc(line1)}</text>
  ${line2 ? `<text x="80" y="270" fill="#ffffff" font-size="48" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${esc(line2)}</text>` : ""}

  <g transform="translate(80, ${line2 ? 320 : 280})">
    <text x="0" y="30" fill="#9ca3af" font-size="20" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="600" letter-spacing="1">PRIZE POOL</text>
    <text x="0" y="80" fill="#818cf8" font-size="44" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${esc(prize_amount)} XLM</text>
  </g>

  <g transform="translate(80, 440)">
    <rect width="580" height="14" rx="7" fill="#1f2937"/>
    <rect width="${fillWidth}" height="14" rx="7" fill="url(#progress-gradient)"/>
    <text x="0" y="45" fill="#e5e7eb" font-size="18" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${sold} / ${max} Tickets Sold (${Math.round(percent * 100)}%)</text>
    <text x="580" y="45" text-anchor="end" fill="#f43f5e" font-size="18" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">${esc(parseEndTime(end_time))}</text>
  </g>

  ${base64Image ? `
    <rect x="725" y="95" width="400" height="400" rx="35" ry="35" fill="#111115" stroke="#1f2937" stroke-width="2" />
    <image href="${base64Image}" x="730" y="100" width="390" height="390" clip-path="url(#rect-clip)" preserveAspectRatio="xMidYMid slice" />
  ` : `
    <g transform="translate(730, 100)">
      <rect width="390" height="390" rx="30" ry="30" fill="#18181b" stroke="#27272a" stroke-width="3" />
      <text x="195" y="220" text-anchor="middle" fill="#6366f1" font-size="100" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-weight="bold">🎟️</text>
    </g>
  `}
</svg>`;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  }

  private resolveMetadataImageUrl(raffle: RaffleOgCardInput): string {
    if (raffle.image_url) {
      return raffle.image_url;
    }
    const extra = raffle.image_urls?.find((url) => typeof url === "string" && url.length > 0);
    return extra ?? "";
  }

  /**
   * Best-effort embed of the raffle metadata image. Any failure (missing URL,
   * non-2xx, network error, non-image payload) yields "" so the card still renders.
   */
  private async loadMetadataImage(imageUrl: string): Promise<string> {
    if (!imageUrl) {
      return "";
    }

    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(4_000) });
      if (!res.ok) {
        return "";
      }
      const buffer = await res.arrayBuffer();
      // A huge or non-image payload cannot be embedded; treat it as unavailable.
      if (buffer.byteLength === 0 || buffer.byteLength > 2_000_000) {
        return "";
      }
      const rawType = res.headers.get("content-type") || "image/png";
      const contentType = rawType.split(";")[0]?.trim() || "image/png";
      if (!/^image\/[a-zA-Z0-9.+-]+$/.test(contentType)) {
        return "";
      }
      return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
    } catch {
      return "";
    }
  }
}
