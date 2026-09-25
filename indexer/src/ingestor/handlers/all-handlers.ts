/**
 * Complete set of default event handlers
 * These handlers match the original EventParserService functionality
 */

import { Injectable } from "@nestjs/common";
import { xdr } from "@stellar/stellar-sdk";
import { BaseEventHandler } from "./base-event.handler";
import {
  AdminTransferAcceptedEvent,
  AdminTransferProposedEvent,
  ContractPausedEvent,
  ContractUnpausedEvent,
  DrawTriggeredEvent,
  EventPayload,
  RandomnessReceivedEvent,
  RandomnessRequestedEvent,
  TicketRefundedEvent,
} from "../event.types";
import { RawSorobanEvent } from "../event-parser.interface";
import { RaffleCancelledHandler } from "./raffle-cancelled.handler";
import { asNumber, asString } from "./decode-utils";

export { RaffleCancelledHandler };

@Injectable()
export class DrawTriggeredHandler extends BaseEventHandler<DrawTriggeredEvent> {
  constructor() {
    super("DrawTriggered");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<DrawTriggeredEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const data = this.toRecord(value);

    if (raffleId === null || !data) return null;

    return {
      raffle_id: raffleId,
      ledger: asNumber(data.ledger) ?? 0,
    };
  }
}

@Injectable()
export class RandomnessRequestedHandler extends BaseEventHandler<RandomnessRequestedEvent> {
  constructor() {
    super("RandomnessRequested");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RandomnessRequestedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const data = this.toRecord(value);

    if (raffleId === null || !data) return null;

    return {
      raffle_id: raffleId,
      request_id: asNumber(data.request_id) ?? 0,
    };
  }
}

@Injectable()
export class RandomnessReceivedHandler extends BaseEventHandler<RandomnessReceivedEvent> {
  constructor() {
    super("RandomnessReceived");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<RandomnessReceivedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const data = this.toRecord(value);

    if (raffleId === null || !data) return null;

    return {
      raffle_id: raffleId,
      seed: this.toHexString(data.seed),
      proof: this.toHexString(data.proof),
    };
  }
}

@Injectable()
export class TicketRefundedHandler extends BaseEventHandler<TicketRefundedEvent> {
  constructor() {
    super("TicketRefunded");
  }

  protected decode(
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<TicketRefundedEvent> | null {
    const raffleId = this.toNumber(topics[1]);
    const ticketId = this.toNumber(topics[2]);
    const data = this.toRecord(value);

    if (raffleId === null || ticketId === null || !data) return null;

    return {
      raffle_id: raffleId,
      ticket_id: ticketId,
      recipient: asString(data.recipient) ?? "",
      amount: asString(data.amount) ?? "0",
    };
  }
}

@Injectable()
export class ContractPausedHandler extends BaseEventHandler<ContractPausedEvent> {
  constructor() {
    super("ContractPaused");
  }

  protected decode(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<ContractPausedEvent> | null {
    const admin = this.toString(topics[1]);
    if (admin === null) return null;

    return { admin };
  }
}

@Injectable()
export class ContractUnpausedHandler extends BaseEventHandler<ContractUnpausedEvent> {
  constructor() {
    super("ContractUnpaused");
  }

  protected decode(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<ContractUnpausedEvent> | null {
    const admin = this.toString(topics[1]);
    if (admin === null) return null;

    return { admin };
  }
}

@Injectable()
export class AdminTransferProposedHandler extends BaseEventHandler<AdminTransferProposedEvent> {
  constructor() {
    super("AdminTransferProposed");
  }

  protected decode(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<AdminTransferProposedEvent> | null {
    const currentAdmin = this.toString(topics[1]);
    const proposedAdmin = this.toString(topics[2]);

    if (currentAdmin === null || proposedAdmin === null) return null;

    return {
      current_admin: currentAdmin,
      proposed_admin: proposedAdmin,
    };
  }
}

@Injectable()
export class AdminTransferAcceptedHandler extends BaseEventHandler<AdminTransferAcceptedEvent> {
  constructor() {
    super("AdminTransferAccepted");
  }

  protected decode(
    topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): EventPayload<AdminTransferAcceptedEvent> | null {
    const oldAdmin = this.toString(topics[1]);
    const newAdmin = this.toString(topics[2]);

    if (oldAdmin === null || newAdmin === null) return null;

    return {
      old_admin: oldAdmin,
      new_admin: newAdmin,
    };
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
