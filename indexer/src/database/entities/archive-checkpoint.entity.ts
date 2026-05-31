import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum ArchiveJobStatus {
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Tracks archiving job progress for safe resumption after interruptions.
 * Each job type (e.g., 'raffle_events') maintains its own checkpoint state.
 */
@Entity("archive_checkpoints")
@Index("idx_archive_checkpoints_job_type_status", ["jobType", "status"])
export class ArchiveCheckpointEntity {
  @PrimaryGeneratedColumn("uuid", { name: "id" })
  id!: string;

  /**
   * Type of archiving job (e.g., 'raffle_events', 'tickets', etc.)
   * Allows multiple archive jobs to track progress independently.
   */
  @Column({ type: "varchar", length: 64, name: "job_type" })
  jobType!: string;

  /**
   * Last successfully processed timestamp.
   * Used as cursor for resuming interrupted jobs.
   */
  @Column({ type: "timestamptz", name: "last_processed_timestamp", nullable: true })
  lastProcessedTimestamp!: Date | null;

  /**
   * Last successfully processed record ID.
   * Used for tie-breaking when multiple records share the same timestamp.
   */
  @Column({ type: "uuid", name: "last_processed_id", nullable: true })
  lastProcessedId!: string | null;

  /**
   * Total number of records archived across all batches in this job.
   */
  @Column({ type: "integer", name: "total_archived", default: 0 })
  totalArchived!: number;

  /**
   * Current batch number (increments with each batch processed).
   */
  @Column({ type: "integer", name: "batch_number", default: 0 })
  batchNumber!: number;

  /**
   * Current status of the archiving job.
   */
  @Column({
    type: "enum",
    enum: ArchiveJobStatus,
    name: "status",
    default: ArchiveJobStatus.IN_PROGRESS,
  })
  status!: ArchiveJobStatus;

  /**
   * Snapshot of configuration used for this job.
   * Helps operators understand what parameters were used.
   */
  @Column({ type: "jsonb", name: "config_snapshot" })
  configSnapshot!: {
    retentionDays: number;
    batchSize: number;
    maxBatch?: number;
    cutoffDate: string;
  };

  @CreateDateColumn({ type: "timestamptz", name: "started_at" })
  startedAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;

  @Column({ type: "timestamptz", name: "completed_at", nullable: true })
  completedAt!: Date | null;
}
