import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSearchIndex1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX idx_raffle_search_gin ON raffles 
            USING GIN (
                to_tsvector('english', 
                    COALESCE(title, '') || ' ' || 
                    COALESCE(description, '') || ' ' || 
                    COALESCE(category, '')
                )
            );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX idx_raffle_search_gin;`);
    }
}