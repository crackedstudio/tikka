import { MigrationInterface, QueryRunner } from "typeorm";

export class OptimizeLeaderboard1711620000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // These indexes ensure sorting by wins, volume, or tickets is lightning fast
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEADERBOARD_WINS" ON "users" ("wins" DESC)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEADERBOARD_VOLUME" ON "users" ("volume" DESC)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEADERBOARD_TICKETS" ON "users" ("tickets" DESC)`);
        
        // This 'composite' index helps if the leaderboard sorts by multiple criteria at once
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_LEADERBOARD_COMPOSITE" ON "users" ("wins" DESC, "volume" DESC)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // This removes the indexes if the team needs to undo the change
        await queryRunner.query(`DROP INDEX "IDX_LEADERBOARD_WINS"`);
        await queryRunner.query(`DROP INDEX "IDX_LEADERBOARD_VOLUME"`);
        await queryRunner.query(`DROP INDEX "IDX_LEADERBOARD_TICKETS"`);
        await queryRunner.query(`DROP INDEX "IDX_LEADERBOARD_COMPOSITE"`);
    }
}
