import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PinningService {
  private readonly logger = new Logger(PinningService.name);

  /**
   * Pins JSON metadata to IPFS using Pinata API.
   * Requires PINATA_JWT or (PINATA_API_KEY and PINATA_API_SECRET) env vars.
   * Skips if ENABLE_IPFS_PINNING is not 'true'.
   */
  async pin(payload: any): Promise<string | null> {
    const isEnabled = process.env.ENABLE_IPFS_PINNING === 'true';
    if (!isEnabled) {
      this.logger.debug('IPFS pinning is disabled');
      return null;
    }

    const pinataJwt = process.env.PINATA_JWT;
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecret = process.env.PINATA_API_SECRET;

    if (!pinataJwt && (!pinataApiKey || !pinataSecret)) {
      this.logger.warn('IPFS pinning enabled but Pinata credentials are missing');
      return null;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (pinataJwt) {
        headers['Authorization'] = `Bearer ${pinataJwt}`;
      } else {
        headers['pinata_api_key'] = pinataApiKey!;
        headers['pinata_secret_api_key'] = pinataSecret!;
      }

      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pinataContent: payload,
          pinataMetadata: {
            name: `raffle-${payload.raffle_id || 'metadata'}-${Date.now()}`,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Pinata API error (${response.status}): ${errorText}`);
        return null;
      }

      const data = (await response.json()) as { IpfsHash: string };
      return data.IpfsHash;
    } catch (err) {
      this.logger.error(`Failed to pin metadata to IPFS: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
