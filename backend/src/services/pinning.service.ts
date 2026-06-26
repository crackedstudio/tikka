import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env.config';

/** Thrown by PinningService.pin() when pinning is enabled but fails. */
export class PinningError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PinningError';
  }
}

@Injectable()
export class PinningService {
  private readonly logger = new Logger(PinningService.name);

  /**
   * Pins JSON metadata to IPFS using Pinata API.
   * Requires PINATA_JWT or (PINATA_API_KEY and PINATA_API_SECRET) env vars.
   * Skips if ENABLE_IPFS_PINNING is not 'true'.
   *
   * @returns The IPFS CID string on success, or `null` when pinning is
   *   intentionally disabled (ENABLE_IPFS_PINNING !== 'true').
   * @throws {PinningError} When pinning is enabled but credentials are missing
   *   or the Pinata API call fails. Callers can catch this to decide whether
   *   to abort the request or continue in a degraded state without a CID.
   */
  async pin(payload: any): Promise<string | null> {
    const isEnabled = env.storage.enableIpfsPinning;
    if (!isEnabled) {
      this.logger.debug('IPFS pinning is disabled — skipping pin attempt');
      return null;
    }

    const pinataJwt = env.storage.pinataJwt;
    const pinataApiKey = env.storage.pinataApiKey;
    const pinataSecret = env.storage.pinataApiSecret;

    if (!pinataJwt && (!pinataApiKey || !pinataSecret)) {
      const msg = 'IPFS pinning is enabled but Pinata credentials are not configured';
      this.logger.error(msg, { hint: 'Set PINATA_JWT or both PINATA_API_KEY and PINATA_API_SECRET' });
      throw new PinningError(msg);
    }

    const raffleId = payload?.raffle_id ?? 'unknown';
    this.logger.log(`Pinning metadata to IPFS`, { raffle_id: raffleId });

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
        const msg = `Pinata API returned ${response.status}`;
        this.logger.error(msg, { raffle_id: raffleId, status: response.status, body: errorText });
        throw new PinningError(`${msg}: ${errorText}`);
      }

      const data = (await response.json()) as { IpfsHash: string };
      this.logger.log(`Successfully pinned metadata`, { raffle_id: raffleId, cid: data.IpfsHash });
      return data.IpfsHash;
    } catch (err) {
      if (err instanceof PinningError) throw err;
      const msg = `Failed to pin metadata to IPFS: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.error(msg, { raffle_id: raffleId, cause: err });
      throw new PinningError(msg, err);
    }
  }
}
