import { Logger } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";
import { AdminProcessor } from "../processors/admin.processor";
import { RaffleProcessor } from "../processors/raffle.processor";
import { TicketProcessor } from "../processors/ticket.processor";
import { RaffleEventEntity } from "../database/entities/raffle-event.entity";
import { DomainEvent } from "./event.types";
import { CURRENT_SCHEMA_VERSION } from "./handlers/schema-version";

type AdminDomainEvent = Extract<
  DomainEvent,
  {
    type:
      | "ContractPaused"
      | "ContractUnpaused"
      | "AdminTransferProposed"
      | "AdminTransferAccepted";
  }
>;

export class CursorAdvance {
  constructor(
    private readonly dataSource: DataSource,
    private readonly raffleProcessor: RaffleProcessor,
    private readonly ticketProcessor: TicketProcessor,
    private readonly adminProcessor: AdminProcessor,
    private readonly logger: Logger,
  ) {}

  async apply(event: DomainEvent, raw: Record<string, unknown>): Promise<void> {
    const runner = await this.applyEvent(event, raw);
    if (!runner) return;

    await runner.commitTransaction();
    await runner.release();
  }

  private async applyEvent(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Promise<QueryRunner | null> {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    const schemaVersion = event.schemaVersion ?? CURRENT_SCHEMA_VERSION;

    switch (event.type) {
      case "RaffleCreated":
        return this.raffleProcessor.handleRaffleCreated(
          event.raffle_id,
          event.creator,
          ledger,
          txHash,
          event.params,
          schemaVersion,
        );

      case "RaffleFinalized":
        return this.raffleProcessor.handleRaffleFinalized(
          event.raffle_id,
          event.winner,
          event.winning_ticket_id,
          event.prize_amount,
          ledger,
          txHash,
          schemaVersion,
        );

      case "RaffleCancelled":
        return this.raffleProcessor.handleRaffleCancelled(
          event.raffle_id,
          event.reason,
          ledger,
          txHash,
          schemaVersion,
        );

      case "TicketPurchased":
        return this.applyTicketEvent(async (runner) => {
          await this.ticketProcessor.handleTicketPurchased(
            event.raffle_id,
            event.buyer,
            event.ticket_ids,
            event.total_paid,
            ledger,
            txHash,
            runner,
          );
        });

      case "TicketRefunded":
        return this.applyTicketEvent(async (runner) => {
          await this.ticketProcessor.handleTicketRefunded(
            event.raffle_id,
            event.ticket_id,
            event.recipient,
            event.amount,
            txHash,
            runner,
          );
        });

      case "ContractPaused":
      case "ContractUnpaused":
      case "AdminTransferProposed":
      case "AdminTransferAccepted":
        return this.applyAdminEvent(event, raw);

      case "DrawTriggered":
        this.logger.log(
          `DrawTriggered for raffle ${event.raffle_id} at ledger ${event.ledger}`,
        );
        return null;

      case "RandomnessRequested":
        this.logger.log(
          `RandomnessRequested for raffle ${event.raffle_id}, request ID ${event.request_id}`,
        );
        return null;

      case "RandomnessReceived":
        this.logger.log(`RandomnessReceived for raffle ${event.raffle_id}`);
        return null;

      default: {
        // Compile-time exhaustiveness: adding a contract event to the
        // DomainEvent union without routing it above fails the build here —
        // the event cannot silently fall through to a runtime warning.
        const unhandled: never = event;
        this.logger.warn(
          `No processor method found for event type: ${(unhandled as DomainEvent).type}`,
        );
        return null;
      }
    }
  }

  private async applyTicketEvent(
    process: (runner: QueryRunner) => Promise<void>,
  ): Promise<QueryRunner> {
    const runner = await this.startRunner();
    try {
      await process(runner);
      return runner;
    } catch (error) {
      await runner.rollbackTransaction();
      await runner.release();
      throw error;
    }
  }

  private async applyAdminEvent(
    event: AdminDomainEvent,
    raw: Record<string, unknown>,
  ): Promise<QueryRunner> {
    const runner = await this.startRunner();
    const ledger = Number(raw.ledger);
    const row = this.toRaffleEventRow(event, raw);

    try {
      if (row) {
        await runner.manager
          .createQueryBuilder()
          .insert()
          .into(RaffleEventEntity)
          .values(row as never)
          .orIgnore()
          .execute();
      }

      switch (event.type) {
        case "ContractPaused":
          await this.adminProcessor.handleContractPaused(event.admin, ledger, runner);
          break;
        case "ContractUnpaused":
          await this.adminProcessor.handleContractUnpaused(event.admin, ledger, runner);
          break;
        case "AdminTransferProposed":
          await this.adminProcessor.handleAdminTransferProposed(
            event.current_admin,
            event.proposed_admin,
            ledger,
            runner,
          );
          break;
        case "AdminTransferAccepted":
          await this.adminProcessor.handleAdminTransferAccepted(
            event.old_admin,
            event.new_admin,
            ledger,
            runner,
          );
          break;
      }

      return runner;
    } catch (error) {
      await runner.rollbackTransaction();
      await runner.release();
      throw error;
    }
  }

  private async startRunner(): Promise<QueryRunner> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    return runner;
  }

  private toRaffleEventRow(
    event: DomainEvent,
    raw: Record<string, unknown>,
  ): Partial<RaffleEventEntity> | null {
    const ledger = Number(raw.ledger);
    const txHash = String(raw.id || raw.paging_token || "");
    if (!txHash || Number.isNaN(ledger)) {
      return null;
    }

    switch (event.type) {
      case "ContractPaused":
        return {
          raffleId: 0,
          eventType: "ContractPaused",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "ContractUnpaused":
        return {
          raffleId: 0,
          eventType: "ContractUnpaused",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          ledger,
          txHash,
          payloadJson: { admin: event.admin },
        };
      case "AdminTransferProposed":
        return {
          raffleId: 0,
          eventType: "AdminTransferProposed",
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
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
          schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
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
}