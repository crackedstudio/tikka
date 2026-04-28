import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, QueryRunner } from 'typeorm';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';

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

    constructor(
        @InjectRepository(IndexerCursorEntity)
        private readonly cursorRepo: Repository<IndexerCursorEntity>,
    ) {}

    /**
     * Loads the last processed ledger (and optional paging token) from storage.
     * This is provided to the ledger poller to resume ingestion.
     */
    async getCursor(): Promise<IndexerCursor | null> {
        this.logger.debug('Fetching cursor from storage...');
        const cursor = await this.cursorRepo.findOne({ where: { id: 1 } });
        
        if (cursor && cursor.lastLedger > 0) {
            return {
                lastLedger: cursor.lastLedger,
                lastPagingToken: cursor.lastPagingToken,
            };
        }
        return null;
    }

    /**
     * Updates the cursor after events are successfully written to the DB.
     *
     * @param ledger The highest ledger processed in the batch.
     * @param token The paging token of the last event processed.
     * @param queryRunner Optional QueryRunner to execute in an existing transaction.
     */
    async saveCursor(ledger: number, token?: string, queryRunner?: QueryRunner): Promise<void> {
        this.logger.debug(`Saving cursor: ledger=${ledger}, token=${token}`);

        const manager: EntityManager = queryRunner ? queryRunner.manager : this.cursorRepo.manager;

        await manager.upsert(
            IndexerCursorEntity,
            {
                id: 1,
                lastLedger: ledger,
                lastPagingToken: token || "",
            },
            ['id'] // conflict paths
        );
    }
}
