import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeLeaderboard1711620000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS" ON "users" ("total_raffles_won" DESC, "address" ASC)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS" ON "users" ((CAST("total_prize_xlm" AS NUMERIC)) DESC, "address" ASC)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS" ON "users" ("total_tickets_bought" DESC, "address" ASC)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USERS_TOTAL_RAFFLES_WON_ADDRESS"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USERS_TOTAL_PRIZE_XLM_NUMERIC_ADDRESS"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USERS_TOTAL_TICKETS_BOUGHT_ADDRESS"`);
    }
}
