import {
  Entity,
  Column,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('platform_state')
export class PlatformStateEntity {
  /** Singleton key — always 'global' */
  @PrimaryColumn({ type: 'varchar', default: "'global'" })
  id!: string;

  @Column({ type: 'boolean', default: false })
  paused!: boolean;

  @Column({ type: 'varchar', nullable: true, name: 'admin_address' })
  adminAddress!: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'pending_admin_address' })
  pendingAdminAddress!: string | null;

  @Column({ type: 'integer', default: 0, name: 'last_updated_ledger' })
  lastUpdatedLedger!: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
