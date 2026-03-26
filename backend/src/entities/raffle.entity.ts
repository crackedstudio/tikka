import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('raffles')
export class Raffle {
  @PrimaryGeneratedColumn()
  id: number;

  @Index() // Standard index for fast lookups by title
  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  category: string;

  @Column('decimal')
  ticket_price: string;

  @Column()
  tickets_sold: number;

  @Column()
  max_tickets: number;

  @Column()
  end_time: string;

  @Column()
  asset: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; 
}