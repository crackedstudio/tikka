import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { EventParserV2Service } from "./event-parser-v2.service";

// Import all default handlers
import { RaffleCreatedHandler } from "./handlers/raffle-created.handler";
import { TicketPurchasedHandler } from "./handlers/ticket-purchased.handler";
import { RaffleFinalizedHandler } from "./handlers/raffle-finalized.handler";
import {
  DrawTriggeredHandler,
  RandomnessRequestedHandler,
  RandomnessReceivedHandler,
  RaffleCancelledHandler,
  TicketRefundedHandler,
  ContractPausedHandler,
  ContractUnpausedHandler,
  AdminTransferProposedHandler,
  AdminTransferAcceptedHandler,
} from "./handlers/all-handlers";

/**
 * Module for extensible event handling system
 */
@Module({
  imports: [ConfigModule],
  providers: [
    EventHandlerRegistry,
    EventParserV2Service,
    // Register all default handler classes
    RaffleCreatedHandler,
    TicketPurchasedHandler,
    RaffleFinalizedHandler,
    DrawTriggeredHandler,
    RandomnessRequestedHandler,
    RandomnessReceivedHandler,
    RaffleCancelledHandler,
    TicketRefundedHandler,
    ContractPausedHandler,
    ContractUnpausedHandler,
    AdminTransferProposedHandler,
    AdminTransferAcceptedHandler,
  ],
  exports: [EventHandlerRegistry, EventParserV2Service],
})
export class EventHandlersModule implements OnModuleInit {
  constructor(
    private readonly registry: EventHandlerRegistry,
    // Inject all handlers
    private readonly raffleCreatedHandler: RaffleCreatedHandler,
    private readonly ticketPurchasedHandler: TicketPurchasedHandler,
    private readonly raffleFinalizedHandler: RaffleFinalizedHandler,
    private readonly drawTriggeredHandler: DrawTriggeredHandler,
    private readonly randomnessRequestedHandler: RandomnessRequestedHandler,
    private readonly randomnessReceivedHandler: RandomnessReceivedHandler,
    private readonly raffleCancelledHandler: RaffleCancelledHandler,
    private readonly ticketRefundedHandler: TicketRefundedHandler,
    private readonly contractPausedHandler: ContractPausedHandler,
    private readonly contractUnpausedHandler: ContractUnpausedHandler,
    private readonly adminTransferProposedHandler: AdminTransferProposedHandler,
    private readonly adminTransferAcceptedHandler: AdminTransferAcceptedHandler,
  ) {}

  async onModuleInit() {
    // Register all default handlers
    this.registry.registerDefaultHandler(this.raffleCreatedHandler);
    this.registry.registerDefaultHandler(this.ticketPurchasedHandler);
    this.registry.registerDefaultHandler(this.raffleFinalizedHandler);
    this.registry.registerDefaultHandler(this.drawTriggeredHandler);
    this.registry.registerDefaultHandler(this.randomnessRequestedHandler);
    this.registry.registerDefaultHandler(this.randomnessReceivedHandler);
    this.registry.registerDefaultHandler(this.raffleCancelledHandler);
    this.registry.registerDefaultHandler(this.ticketRefundedHandler);
    this.registry.registerDefaultHandler(this.contractPausedHandler);
    this.registry.registerDefaultHandler(this.contractUnpausedHandler);
    this.registry.registerDefaultHandler(this.adminTransferProposedHandler);
    this.registry.registerDefaultHandler(this.adminTransferAcceptedHandler);
  }
}
