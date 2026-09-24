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
          // DERIVED FIELD (see ENTITY_OWNERSHIP.md) — failure category used to
          // decide retryability and escalation. Moved out of the legacy schema
          // so the table matches DeadLetterEventEntity exactly.
          {
            name: 'reason',
            type: 'varchar',
            length: '32',
            default: "'HANDLER_ERROR'",
          },
          // DERIVED FIELD — whether this entry is eligible for automatic replay.
          { name: 'retryable', type: 'boolean', default: true },
          { name: 'retry_count', type: 'integer', default: 0 },
          // DERIVED FIELD — number of dispatch attempts before entering the DLQ.
          { name: 'attempt_count', type: 'integer', default: 1 },
          // IDEMPOTENCY GUARD — set when this entry was successfully replayed.
          { name: 'replayed_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'NOW()' },
          { name: 'last_attempt_at', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    // Hot-path indexes declared on DeadLetterEventEntity.
    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_retry_count', columnNames: ['retry_count'] }),
    );
    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_reason', columnNames: ['reason'] }),
    );
    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_ledger', columnNames: ['ledger'] }),
    );
    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_replayed_at', columnNames: ['replayed_at'] }),
    );
    await queryRunner.createIndex(
      'dead_letter_events',
      new TableIndex({ name: 'idx_dle_replay_eligible', columnNames: ['replayed_at', 'ledger'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dead_letter_events', true);
  }
}