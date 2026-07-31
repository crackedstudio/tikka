import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * @deprecated Superseded by `AuditHotPathIndexes1770000000000` in
 * `database/migrations/`. This file lived outside the TypeORM migrations
 * directory and was never applied by `migrationsRun`. Kept as a no-op so
 * any manual `ts-node` invocation that still imports it does not fail.
 *
 * See: docs/performance/indexer-index-audit.md
 */
export class OptimizeLeaderboard1711620000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // No-op — indexes are created by AuditHotPathIndexes1770000000000.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op — rollback via AuditHotPathIndexes1770000000000.down().
  }
}
