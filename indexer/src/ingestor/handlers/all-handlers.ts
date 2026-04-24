/**
 * Complete set of default event handlers
 * These handlers match the original EventParserService functionality
 */

import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import { DomainEvent } from "../event.types";
import { RawSorobanEvent } from "../event-parser.service";

@Injectable()
export class DrawTriggeredHandler extends BaseEventHandler {
  constructor() {
    super("DrawTriggered");
  }

  parse(topics: xdr.ScVal[], value: xdr.ScVal): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) return null;

      return {
        type: "DrawTriggered",
        raffle_id: raffleId,
        ledger: Number(data.ledger),
      };
    } catch (error) {
      this.logger.error(`Error parsing DrawTriggered: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class RandomnessRequestedHandler extends BaseEventHandler {
  constructor() {
    super("RandomnessRequested");
  }

  parse(topics: xdr.ScVal[], value: xdr.ScVal): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) return null;

      return {
        type: "RandomnessRequested",
        raffle_id: raffleId,
        request_id: Number(data.request_id),
      };
    } catch (error) {
      this.logger.error(`Error parsing RandomnessRequested: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class RandomnessReceivedHandler extends BaseEventHandler {
  constructor() {
    super("RandomnessReceived");
  }

  parse(topics: xdr.ScVal[], value: xdr.ScVal): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) return null;

      return {
        type: "RandomnessReceived",
        raffle_id: raffleId,
        seed: this.toHexString(data.seed),
        proof: this.toHexString(data.proof),
      };
    } catch (error) {
      this.logger.error(`Error parsing RandomnessReceived: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class RaffleCancelledHandler extends BaseEventHandler {
  constructor() {
    super("RaffleCancelled");
  }

  parse(topics: xdr.ScVal[], value: xdr.ScVal): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const data = this.toNative(value);

      if (raffleId === null || !data) return null;

      return {
        type: "RaffleCancelled",
        raffle_id: raffleId,
        reason: data.reason,
      };
    } catch (error) {
      this.logger.error(`Error parsing RaffleCancelled: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class TicketRefundedHandler extends BaseEventHandler {
  constructor() {
    super("TicketRefunded");
  }

  parse(topics: xdr.ScVal[], value: xdr.ScVal): DomainEvent | null {
    try {
      const raffleId = this.toNumber(topics[1]);
      const ticketId = this.toNumber(topics[2]);
      const data = this.toNative(value);

      if (raffleId === null || ticketId === null || !data) return null;

      return {
        type: "TicketRefunded",
        raffle_id: raffleId,
        ticket_id: ticketId,
        recipient: data.recipient,
        amount: data.amount.toString(),
      };
    } catch (error) {
      this.logger.error(`Error parsing TicketRefunded: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class ContractPausedHandler extends BaseEventHandler {
  constructor() {
    super("ContractPaused");
  }

  parse(topics: xdr.ScVal[]): DomainEvent | null {
    try {
      const admin = this.toString(topics[1]);
      if (admin === null) return null;

      return { type: "ContractPaused", admin };
    } catch (error) {
      this.logger.error(`Error parsing ContractPaused: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class ContractUnpausedHandler extends BaseEventHandler {
  constructor() {
    super("ContractUnpaused");
  }

  parse(topics: xdr.ScVal[]): DomainEvent | null {
    try {
      const admin = this.toString(topics[1]);
      if (admin === null) return null;

      return { type: "ContractUnpaused", admin };
    } catch (error) {
      this.logger.error(`Error parsing ContractUnpaused: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class AdminTransferProposedHandler extends BaseEventHandler {
  constructor() {
    super("AdminTransferProposed");
  }

  parse(topics: xdr.ScVal[]): DomainEvent | null {
    try {
      const currentAdmin = this.toString(topics[1]);
      const proposedAdmin = this.toString(topics[2]);

      if (currentAdmin === null || proposedAdmin === null) return null;

      return {
        type: "AdminTransferProposed",
        current_admin: currentAdmin,
        proposed_admin: proposedAdmin,
      };
    } catch (error) {
      this.logger.error(`Error parsing AdminTransferProposed: ${error.message}`);
      return null;
    }
  }
}

@Injectable()
export class AdminTransferAcceptedHandler extends BaseEventHandler {
  constructor() {
    super("AdminTransferAccepted");
  }

  parse(topics: xdr.ScVal[]): DomainEvent | null {
    try {
      const oldAdmin = this.toString(topics[1]);
      const newAdmin = this.toString(topics[2]);

      if (oldAdmin === null || newAdmin === null) return null;

      return {
        type: "AdminTransferAccepted",
        old_admin: oldAdmin,
        new_admin: newAdmin,
      };
    } catch (error) {
      this.logger.error(`Error parsing AdminTransferAccepted: ${error.message}`);
      return null;
    }
  }
}

// Export all handlers
export const ALL_DEFAULT_HANDLERS = [
  DrawTriggeredHandler,
  RandomnessRequestedHandler,
  RandomnessReceivedHandler,
  RaffleCancelledHandler,
  TicketRefundedHandler,
  ContractPausedHandler,
  ContractUnpausedHandler,
  AdminTransferProposedHandler,
  AdminTransferAcceptedHandler,
];
