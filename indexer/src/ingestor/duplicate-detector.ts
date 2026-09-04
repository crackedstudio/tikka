import { CURRENT_SCHEMA_VERSION } from "./handlers/schema-version";
import { assertNever, DomainEvent } from "./event.types";

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
      case "RaffleCreated":
      case "TicketPurchased":
      case "RaffleFinalized":
      case "RaffleCancelled":
      case "TicketRefunded":
      case "ContractPaused":
      case "ContractUnpaused":
      case "AdminTransferProposed":
      case "AdminTransferAccepted":
        return true;
      default:
        // Compile-time exhaustiveness: a new topic added to the union without
        // a case above fails the build here.
        assertNever(event, "eventNeedsDatabase");
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
      case "DrawTriggered":
      case "RandomnessRequested":
      case "RandomnessReceived":
        return `${event.type}Handler`;
      default:
        // Compile-time exhaustiveness (see eventNeedsDatabase).
        assertNever(event, "getHandlerName");
    }
  }
}