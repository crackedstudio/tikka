/** @owner indexer */
import { Entity, PrimaryGeneratedColumn } from 'typeorm';


Entity('raffle')
export class Raffle {
    @PrimaryGeneratedColumn()
    id: number;
}
