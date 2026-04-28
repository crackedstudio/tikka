import { Injectable, Logger } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { AdminProcessor } from "../processors/admin.processor";
import { DomainEvent } from "./event.types";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";

export interface DispatchItem {
  event: DomainEvent;
  raw: Record<string, unknown> & {
    ledger?: number | string;
    id?: string;
    paging_token?: string;
  };
}

/**
 * Orchestrates domain event ingestion: bulk-append raffle_events where applicable,
 * then applies processor side-effects inside a single transaction per batch.
 */
@Injectable()
export class IngestionDispatcherService {
  private readonly logger = new Logger(IngestionDispatcherService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly raffleProcessor: RaffleProcessor,
    private readonly ticketProcessor: TicketProcessor,
    private readonly adminProcessor: AdminProcessor,
  ) {}

  /**
   * Single-event compatibility wrapper — runs as a one-item batch.
   */
  async dispatch(event: DomainEvent, raw: unknown): Promise<QueryRunner | null> {
    return this.dispatchBatch([{ event, raw: raw as DispatchItem["raw"] }]);
  }

  /**
   * Process multiple decoded events in one DB transaction.
   * Returns an open QueryRunner (transaction not committed) for the caller to commit after cursor write.
   * Returns null when no database work is required (e.g. only log-only events).
   */
  async dispatchBatch(items: DispatchItem[]): Promise<QueryRunner | null> {
    if (items.length === 0) {
      return null;
    }

    const needsTx = items.some(({ event }) => this.eventNeedsDatabase(event));
    if (!needsTx) {
      return null;
    }

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await this.bulkInsertRaffleEvents(items, runner);

      for (const { event, raw } of items) {
        await this.applyEvent(event, raw, runner);
      }

      return runner;
    } catch (error: unknown) {
      await runner.rollbackTransaction();
      await runner.release();
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Batch dispatch failed: ${message}`, stack);
      throw error;
    }
  }

  private eventNeedsDatabase(event: DomainEvent): boolean {
    switch (event.type) {
      case "DrawTriggered":
      case "RandomnessRequested":
      case "RandomnessReceived":
        return false;
      default:
        return true;
    }
  }

  private toRaffleEventRow(
    event: DomainEvent,
    raw: DispatchItem["raw"],
  ): Partial<RaffleEventEntity> | null {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    if (!txHash || Number.isNaN(ledger)) {
      return null;
    }

    switch (event.type) {
      case "RaffleCancelled":
        return {
          raffleId: event.raffle_id,
          eventType: "RaffleCancelled",
          ledger,
          txHash,
          payloadJson: {
            raffle_id: event.raffle_id,
            reason: event.reason,
          },
        };
      case "ContractPaused":
        return {
          raffleId: 0,
          eventType: "ContractPaused",
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "ContractUnpaused":
        return {
          raffleId: 0,
          eventType: "ContractUnpaused",
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "AdminTransferProposed":
        return {
          raffleId: 0,
          eventType: "AdminTransferProposed",
          ledger,
          txHash,
          payloadJson: {
            current_admin: event.current_admin,
            proposed_admin: event.proposed_admin,
          },
        };
      case "AdminTransferAccepted":
        return {
          raffleId: 0,
          eventType: "AdminTransferAccepted",
          ledger,
          txHash,
          payloadJson: {
            old_admin: event.old_admin,
            new_admin: event.new_admin,
          },
        };
      default:
        return null;
    }
  }

  private async bulkInsertRaffleEvents(
    items: DispatchItem[],
    runner: QueryRunner,
  ): Promise<void> {
    const rows: Partial<RaffleEventEntity>[] = [];
    for (const item of items) {
      const row = this.toRaffleEventRow(item.event, item.raw);
      if (row) {
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return;
    }

    const byType = new Map<string, Partial<RaffleEventEntity>[]>();
    for (const row of rows) {
      const t = row.eventType!;
      if (!byType.has(t)) {
        byType.set(t, []);
      }
      byType.get(t)!.push(row);
    }

    for (const [, group] of byType) {
      if (group.length === 0) {
        continue;
      }
      await runner.manager
        .createQueryBuilder()
        .insert()
        .into(RaffleEventEntity)
        .values(group as never)
        .orIgnore()
        .execute();
    }
  }

  private async applyEvent(
    event: DomainEvent,
    raw: DispatchItem["raw"],
    runner: QueryRunner,
  ): Promise<void> {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");

    switch (event.type) {
      case "RaffleCreated":
        await this.raffleProcessor.handleRaffleCreated(
          event.raffle_id,
          event.creator,
          ledger,
          runner,
        );
        return;

      case "TicketPurchased":
        await this.ticketProcessor.handleTicketPurchased(
          event.raffle_id,
          event.buyer,
          event.ticket_ids,
          event.total_paid,
          ledger,
          txHash,
          runner,
        );
        return;

      case "RaffleFinalized":
        await this.raffleProcessor.handleRaffleFinalized(
          event.raffle_id,
          event.winner,
          event.prize_amount,
          runner,
        );
        return;

      case "RaffleCancelled":
        await this.raffleProcessor.handleRaffleCancelled(
          event.raffle_id,
          event.reason,
          ledger,
          txHash,
          runner,
        );
        return;

      case "TicketRefunded":
        await this.ticketProcessor.handleTicketRefunded(
          event.raffle_id,
          event.ticket_id,
          event.recipient,
          event.amount,
          txHash,
          runner,
        );
        return;

      case "ContractPaused":
        await this.adminProcessor.handleContractPaused(event.admin, ledger, runner);
        return;

      case "ContractUnpaused":
        await this.adminProcessor.handleContractUnpaused(event.admin, ledger, runner);
        return;

      case "AdminTransferProposed":
        await this.adminProcessor.handleAdminTransferProposed(
          event.current_admin,
          event.proposed_admin,
          ledger,
          runner,
        );
        return;

      case "AdminTransferAccepted":
        await this.adminProcessor.handleAdminTransferAccepted(
          event.old_admin,
          event.new_admin,
          ledger,
          runner,
        );
        return;

      case "DrawTriggered":
        this.logger.log(
          `DrawTriggered for raffle ${event.raffle_id} at ledger ${event.ledger}`,
        );
        return;

      case "RandomnessRequested":
        this.logger.log(
          `RandomnessRequested for raffle ${event.raffle_id}, request ID ${event.request_id}`,
        );
        return;

      case "RandomnessReceived":
        this.logger.log(`RandomnessReceived for raffle ${event.raffle_id}`);
        return;

      default:
        this.logger.warn(
          `No processor method found for event type: ${(event as DomainEvent).type}`,
        );
    }
  }
}
