import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
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
    constructor(
        @InjectRepository(IndexerCursorEntity)
        private readonly cursorRepo: Repository<IndexerCursorEntity>,
    ) {}

    /**
     * Loads the last processed ledger (and optional paging token) from the database.
     * Returns null when no prior progress exists (row absent or lastLedger === 0).
     */
    async getCursor(): Promise<IndexerCursor | null> {
        const row = await this.cursorRepo.findOne({ where: { id: 1 } });
        if (!row || row.lastLedger === 0) {
            return null;
        }
        return { lastLedger: row.lastLedger, lastPagingToken: row.lastPagingToken };
    }

    /**
     * Upserts the singleton cursor row (id=1).
     * When queryRunner is provided, the write participates in the caller's transaction.
     * The caller is responsible for commit/rollback/release.
     *
     * @param ledger The highest ledger processed.
     * @param token The paging token of the last event processed.
     * @param queryRunner Optional QueryRunner to enlist in an existing transaction.
     */
    async saveCursor(ledger: number, token?: string, queryRunner?: QueryRunner): Promise<void> {
        const payload = { id: 1, lastLedger: ledger, lastPagingToken: token ?? '' };
        if (queryRunner) {
            await queryRunner.manager.upsert(IndexerCursorEntity, payload, ['id']);
        } else {
            await this.cursorRepo.upsert(payload, ['id']);
        }
    }
}
