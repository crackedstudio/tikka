import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("webhook_deliveries")
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  webhookUrl!: string;

  @Column()
  eventType!: string;

  @Column("jsonb")
  payload!: Record<string, any>;

  @Column()
  status!: string;

  @Column()
  attempts!: number;

  @Column({ nullable: true, type: "text" })
  errorResponse?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
