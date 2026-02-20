import { Injectable, Logger } from '@nestjs/common';

/**
 * Interface representing the cursor data stored in the database.
 */
export interface IndexerCursor {
    lastLedger: number;
    lastPagingToken?: string;
}

@Injectable()
export class CursorManagerService {
    private readonly logger = new Logger(CursorManagerService.name);

    // In a real implementation, this would be injected with a database repository or client.
    // For now, we will maintain an in-memory state that simulates db persistence as requested
    // for the scaffolding phase.
    private currentCursor: IndexerCursor = {
        lastLedger: 0,
        lastPagingToken: undefined,
    };

    /**
     * Loads the last processed ledger (and optional paging token) from storage.
     * This is provided to the ledger poller to resume ingestion.
     */
    async getCursor(): Promise<IndexerCursor | null> {
        this.logger.debug('Fetching cursor from storage...');
        // Replace with actual DB call: `return await this.cursorRepo.findOne(...)`
        return this.currentCursor.lastLedger > 0 ? this.currentCursor : null;
    }

    /**
     * Updates the cursor after events are successfully written to the DB.
     * This should be called within the same transaction as event writes to ensure atomicity.
     *
     * @param ledger The highest ledger processed in the batch.
     * @param token The paging token of the last event processed.
     */
    async saveCursor(ledger: number, token?: string): Promise<void> {
        this.logger.debug(`Saving cursor: ledger=${ledger}, token=${token}`);

        // Replace with actual DB update:
        // await this.cursorRepo.upsert({ id: 'default', lastLedger: ledger, lastPagingToken: token })
        this.currentCursor = {
            lastLedger: ledger,
            lastPagingToken: token,
        };
    }
}
