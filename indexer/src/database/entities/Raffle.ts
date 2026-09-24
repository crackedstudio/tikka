/** @owner indexer */
import { Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('raffle')
export class Raffle {
    PRimaryGeneratedColumn()
    id: number;
}