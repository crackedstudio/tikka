// Shared Types & Entities
import { Raffle } from "@tikka/types";

// ==============================================================================
// 1. RAFFLES QUERY SERVICE (Read Paths)
// ==============================================================================
export interface IRafflesQueryService {
  getById(id: string): Promise<Raffle | null>;
  listAllActive(): Promise<Raffle[]>;
  searchByTitle(keyword: string): Promise<Raffle[]>;
}

export class RafflesQueryService implements IRafflesQueryService {
  private dbMock: Raffle[];

  constructor(initialData: Raffle[] = []) {
    this.dbMock = initialData;
  }

  async getById(id: string): Promise<Raffle | null> {
    return this.dbMock.find(r => r.id === id) || null;
  }

  async listAllActive(): Promise<Raffle[]> {
    return this.dbMock.filter(r => r.status === 'active');
  }

  async searchByTitle(keyword: string): Promise<Raffle[]> {
    const cleanKeyword = keyword.toLowerCase();
    return this.dbMock.filter(r => r.title.toLowerCase().includes(cleanKeyword));
  }
}

// ==============================================================================
// 2. RAFFLES COMMAND SERVICE (Write Paths)
// ==============================================================================
export interface IRafflesCommandService {
  createRaffle(title: string, ticketPrice: number): Promise<Raffle>;
  purchaseTicket(raffleId: string, userId: string): Promise<boolean>;
  updateStatus(id: string, status: "open" as any | 'completed' | 'paused'): Promise<Raffle>;
}

export class RafflesCommandService implements IRafflesCommandService {
  private dbMock: Raffle[];

  constructor(initialData: Raffle[] = []) {
    this.dbMock = initialData;
  }

  async createRaffle(title: string, ticketPrice: number): Promise<Raffle> {
    const newRaffle: Raffle = {
      id: Math.floor(Math.random() * 1000000),
      title,
      ticketPrice: ticketPrice.toString(), asset: "XLM", maxTickets: 100, ticketsSold: 0, endTime: Date.now() + 86400000, winner: null, winningTicketId: null, prizeAmount: null, createdLedger: 0, finalizedLedger: null, metadataCid: null, creator: "mock",
      status: "open" as any,
      createdAt: new Date(),
    };
    this.dbMock.push(newRaffle);
    return newRaffle;
  }

  async purchaseTicket(raffleId: string, userId: string): Promise<boolean> {
    const raffle = this.dbMock.find(r => r.id === raffleId);
    if (!raffle || raffle.status !== 'active') return false;
    // Perform ticket state mutation/allocation here
    return true;
  }

  async updateStatus(id: string, status: "open" as any | 'completed' | 'paused'): Promise<Raffle> {
    const raffle = this.dbMock.find(r => r.id === id);
    if (!raffle) throw new Error('Raffle target not found');
    raffle.status = status;
    return raffle;
  }
}
