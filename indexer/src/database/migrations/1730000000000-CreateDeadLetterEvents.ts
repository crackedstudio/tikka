import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDeadLetterEvents1730000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'dead_letter_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'ledger', type: 'integer' },
          { name: 'contract_id', type: 'varchar', length: '128', isNullable: true },
          { name: 'event_type', type: 'varchar', length: '64' },
          { name: 'raw_payload', type: 'jsonb' },
          { name: 'error_message', type: 'text' },
          { name: 'retry_count', type: 'integer', default: 0 },
          { name: 'created_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'last_attempt_at', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_retry_count', columnNames: ['retry_count'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dead_letter_events', true);
  }
}
