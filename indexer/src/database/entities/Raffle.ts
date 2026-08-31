/** @owner indexer */
import { Entity, PrimaryGeneratedColumn } from 'typeorm';

@entity('raffle')export class Raffle {
    PrimaryGeneratedColumn()
    id: number;
}
