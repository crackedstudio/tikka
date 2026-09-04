import { CURRENT_SCHEMA_VERSION } from "./handlers/schema-version";
import { DomainEvent } from "./event.types";

export interface DispatchIdentity {
  ledger: number;
  txHash: string;
  eventId: string;
  handlerName: string;
  schemaVersion: number;
  needsDatabase: boolean;
}

export class DuplicateDetector {
  inspect(event: DomainEvent, raw: Record<string, unknown>): DispatchIdentity {
    const txHash = String(raw.id || raw.paging_token || "");

    return {
      ledger: Number(raw.ledger),
      txHash,
      eventId: txHash || "unknown",
      handlerName: this.getHandlerName(event),
      schemaVersion: event.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      needsDatabase: this.eventNeedsDatabase(event),
    };
  }

  eventNeedsDatabase(event: DomainEvent): boolean {
    switch (event.type) {
      case "DrawTriggered":
      case "RandomnessRequested":
      case "RandomnessReceived":
        return false;
      default:
        return true;
    }
  }

  getHandlerName(event: DomainEvent): string {
    switch (event.type) {
      case "RaffleCreated":
        return "RaffleProcessor.handleRaffleCreated";
      case "TicketPurchased":
        return "TicketProcessor.handleTicketPurchased";
      case "RaffleFinalized":
        return "RaffleProcessor.handleRaffleFinalized";
      case "RaffleCancelled":
        return "RaffleProcessor.handleRaffleCancelled";
      case "TicketRefunded":
        return "TicketProcessor.handleTicketRefunded";
      case "ContractPaused":
        return "AdminProcessor.handleContractPaused";
      case "ContractUnpaused":
        return "AdminProcessor.handleContractUnpaused";
      case "AdminTransferProposed":
        return "AdminProcessor.handleAdminTransferProposed";
      case "AdminTransferAccepted":
        return "AdminProcessor.handleAdminTransferAccepted";
      default:
        return `${event.type}Handler`;
    }
  }
}