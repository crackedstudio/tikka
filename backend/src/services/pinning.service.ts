import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env.config';
import type { RaffleMetadata } from './metadata.service';

@Injectable()
export class PinningService {
  private readonly logger = new Logger(PinningService.name);

  /**
   * Pins JSON metadata to IPFS using Pinata API.
   * Requires PINATA_JWT or (PINATA_API_KEY and PINATA_API_SECRET) env vars.
   * Skips if ENABLE_IPFS_PINNING is not 'true'.
   */
  async pin(metadata: RaffleMetadata): Promise<string | null> {
    const isEnabled = env.storage.enableIpfsPinning;
    if (!isEnabled) {
      this.logger.debug('IPFS pinning is disabled');
      return null;
    }

    const pinataJwt = env.storage.pinataJwt;
    const pinataApiKey = env.storage.pinataApiKey;
    const pinataSecret = env.storage.pinataApiSecret;

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
          pinataContent: metadata,
          pinataMetadata: {
            name: `raffle-${metadata.raffle_id || 'metadata'}-${Date.now()}`,
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
