import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IndexerCursorEntity } from '../../database/entities/indexer-cursor.entity';
import {
  CursorIntegrityError,
  CursorManagerService,
} from '../../ingestor/cursor-manager.service';
import { CURSOR_CHECKPOINT_VERSION } from '../../ingestor/cursor-integrity';
import {
  CONTAINER_STARTUP_MS,
  DbContainerContext,
  startDb,
  stopDb,
} from './helpers/db-container';

describe('Startup cursor integrity integration', () => {
  let ctx: DbContainerContext;

  beforeAll(async () => {
    ctx = await startDb();
  }, CONTAINER_STARTUP_MS);

  afterAll(async () => stopDb(ctx));

  beforeEach(async () => {
    await ctx.dataSource.query('TRUNCATE TABLE indexer_cursor RESTART IDENTITY');
  });

  it('halts startup when the persisted cursor is corrupted', async () => {
    await ctx.dataSource.query(
      `INSERT INTO indexer_cursor
         (id, last_ledger, last_paging_token, ledger_hashes,
          processed_event_count, saved_at, checkpoint_version)
       VALUES (1, $1, $2, $3::jsonb, $4, $5, $6)`,
      [
        100,
        '',
        JSON.stringify([{ ledger: 100, hash: 'abc' }]),
        10,
        new Date(),
        CURSOR_CHECKPOINT_VERSION + 1,
      ],
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        CursorManagerService,
        {
          provide: getRepositoryToken(IndexerCursorEntity),
          useValue: ctx.dataSource.getRepository(IndexerCursorEntity),
        },
      ],
    }).compile();

    const cursorManager = moduleRef.get(CursorManagerService);

    await expect(cursorManager.validateStartupIntegrity()).rejects.toBeInstanceOf(
      CursorIntegrityError,
    );
    expect(cursorManager.getStatus().mode).toBe('DEGRADED');
    expect(cursorManager.getStatus().startupIntegrityPassed).toBe(false);
    expect(cursorManager.getStatus().lastViolation?.code).toBe('VERSION_MISMATCH');

    await moduleRef.close();
  });
});
