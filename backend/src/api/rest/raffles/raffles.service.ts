import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MetadataService,
  RaffleMetadata,
  UpsertMetadataPayload,
} from '../../../services/metadata.service';
import {
  IndexerService,
  IndexerRaffleData,
  IndexerListRafflesFilters,
  IndexerListRafflesResponse,
} from '../../../services/indexer.service';
import { PurchaseTicketPayload } from './dto';

/** Merged raffle detail: contract data + off-chain metadata */
export interface RaffleDetailResponse {
  id: number;
  /** From indexer (contract state) */
  creator?: string;
  status?: string;
  ticket_price?: string;
  asset?: string;
  max_tickets?: number;
  tickets_sold?: number;
  end_time?: string;
  winner?: string | null;
  prize_amount?: string | null;
  created_ledger?: number;
  finalized_ledger?: number | null;
  metadata_cid?: string | null;
  created_at?: string;
  /** From Supabase (off-chain metadata) */
  title?: string;
  description?: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  category?: string | null;
}

@Injectable()
export class RafflesService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly indexerService: IndexerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * List raffles with optional filters (status, category, creator, asset).
   */
  async list(filters: IndexerListRafflesFilters = {}): Promise<IndexerListRafflesResponse> {
    return this.indexerService.listRaffles(filters);
  }

  /**
   * Fetch metadata for multiple raffle IDs in one query.
   * Returns an array of found records; IDs with no metadata are omitted.
   */
  async getBatchMetadata(raffleIds: number[]): Promise<RaffleMetadata[]> {
    const map = await this.metadataService.getBatchMetadata(raffleIds);
    return Array.from(map.values());
  }

  /**
   * Create or update raffle metadata (title, description, image_url, category, metadata_cid).
   */
  async upsertMetadata(
    raffleId: number,
    payload: UpsertMetadataPayload,
    requesterAddress: string,
  ) {
    const raffle = await this.indexerService.getRaffle(raffleId);
    if (!raffle) {
      throw new NotFoundException(`Raffle ${raffleId} not found`);
    }

    if (raffle.creator.toLowerCase() !== requesterAddress.toLowerCase()) {
      throw new ForbiddenException(
        `Only raffle creator ${raffle.creator} can update metadata for raffle ${raffleId}`,
      );
    }

    return this.metadataService.upsertMetadata(raffleId, payload);
  }

  /**
   * Get raffle detail by id. Merges contract data from indexer with off-chain metadata from Supabase.
   */
  async getById(id: number): Promise<RaffleDetailResponse> {
    const [indexerData, metadata] = await Promise.all([
      this.indexerService.getRaffle(id),
      this.metadataService.getMetadata(id),
    ]);

    if (!indexerData && !metadata) {
      throw new NotFoundException(`Raffle ${id} not found`);
    }

    return this.mergeRaffleDetail(id, indexerData ?? null, metadata ?? null);
  }

  /**
   * Soft-delete raffle metadata. Creator can delete their own; admin bypass is
   * handled at the controller level (AdminGuard). Here we enforce creator-only
   * for the standard JWT path.
   */
  async deleteMetadata(
    raffleId: number,
    requesterAddress: string,
  ): Promise<{ raffle_id: number; deleted_at: string }> {
    const raffle = await this.indexerService.getRaffle(raffleId);
    if (!raffle) {
      throw new NotFoundException(`Raffle ${raffleId} not found`);
    }

    if (raffle.creator.toLowerCase() !== requesterAddress.toLowerCase()) {
      throw new ForbiddenException(
        `Only raffle creator ${raffle.creator} can delete metadata for raffle ${raffleId}`,
      );
    }

    return this.softDeleteMetadata(raffleId);
  }

  /**
   * Soft-delete raffle metadata (creator or admin).
   * Callers must verify authorization before calling this method.
   */
  async softDeleteMetadata(raffleId: number): Promise<{ raffle_id: number; deleted_at: string }> {
    const result = await this.metadataService.softDeleteMetadata(raffleId);
    return { raffle_id: result.raffle_id, deleted_at: result.deleted_at as string };
  }

  /**
   * Restore a soft-deleted raffle metadata record (admin only).
   */
  async restoreMetadata(raffleId: number): Promise<{ raffle_id: number }> {
    const result = await this.metadataService.restoreMetadata(raffleId);
    return { raffle_id: result.raffle_id };
  }

  /**
   * Return all soft-deleted raffle metadata records (admin only).
   */
  async getArchivedMetadata() {
    return this.metadataService.getArchivedMetadata();
  }

  /**
   * Purchase tickets for a raffle.
   * The actual on-chain transaction is submitted by the client via the SDK;
   * this endpoint records the intent and returns a confirmation.
   */
  async purchaseTickets(
    raffleId: number,
    payload: PurchaseTicketPayload,
    walletAddress: string,
  ): Promise<{ transactionHash: string; raffleId: number; quantity: number; buyer: string }> {
    if (!this.config.get<boolean>('FEATURE_RAFFLE_TICKET_PURCHASE', false)) {
      throw new NotImplementedException(
        'Ticket purchase is disabled until blockchain integration is complete.',
      );
    }

    const raffle = await this.indexerService.getRaffle(raffleId);
    if (!raffle) {
      throw new NotFoundException(`Raffle ${raffleId} not found`);
    }

    // Validate raffle is open
    const status = typeof raffle.status === 'string' ? raffle.status.toLowerCase() : '';
    if (status !== 'open') {
      throw new UnprocessableEntityException(
        `Raffle ${raffleId} is not open for purchases (status=${raffle.status})`,
      );
    }

    // NOTE: The SDK integration should submit an on-chain transaction and
    // return the transaction hash. At this stage we simulate submission by
    // returning a pseudo transaction hash so the API can return 201.
    // When the SDK is wired up, replace this with a call to TicketService.buy(...)
    // and return the real transactionHash from the SDK response.
    const txHash = `0x${Buffer.from(String(Date.now())).toString('hex')}`;

    return { transactionHash: txHash, raffleId, quantity: payload.quantity, buyer: walletAddress };
  }

  /**
   * Get recent participants for a raffle.
   * Returns list of participant addresses with timestamps, optionally filtered by 'since' timestamp.
   */
  async getRecentParticipants(
    raffleId: number,
    sinceTimestamp: number = 0,
  ): Promise<Array<{ address: string; timestamp: number }>> {
    // TODO: Query blockchain events or database for ticket purchases
    // For now, return empty array as placeholder
    // This will be populated by the indexer service once ticket purchase events are indexed
    return [];
  }

  private mergeRaffleDetail(
    id: number,
    contract: IndexerRaffleData | null,
    metadata: RaffleMetadata | null,
  ): RaffleDetailResponse {
    const response: RaffleDetailResponse = { id };

    if (contract) {
      response.creator = contract.creator;
      response.status = contract.status;
      response.ticket_price = contract.ticket_price;
      response.asset = contract.asset;
      response.max_tickets = contract.max_tickets;
      response.tickets_sold = contract.tickets_sold;
      response.end_time = contract.end_time;
      response.winner = contract.winner;
      response.prize_amount = contract.prize_amount;
      response.created_ledger = contract.created_ledger;
      response.finalized_ledger = contract.finalized_ledger;
      response.metadata_cid = contract.metadata_cid;
      response.created_at = contract.created_at;
    }

    if (metadata) {
      response.title = metadata.title;
      response.description = metadata.description;
      response.image_url = metadata.image_url;
      response.image_urls = metadata.image_urls;
      response.category = metadata.category;
      // Prefer metadata_cid from metadata if contract doesn't have it
      if (!response.metadata_cid && metadata.metadata_cid) {
        response.metadata_cid = metadata.metadata_cid;
      }
    }

    return response;
  }
}
