import { Logger, Module, OnModuleInit } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { EventParserV2Service } from "./event-parser-v2.service";
import { EVENT_PARSER } from "./event-parser.interface";
import { IEventHandler } from "./event-handler.interface";
import {
  assertValidEventHandlerConfig,
  buildValidationContext,
  loadEventHandlerConfigFile,
  DEFAULT_EVENT_HANDLER_CONFIG,
} from "./event-handler-config";

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
    // Bind the parser contract token to the single chosen parser (V2) so
    // ingestion services depend on IEventParser rather than a concrete class.
    { provide: EVENT_PARSER, useExisting: EventParserV2Service },
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
  exports: [EventHandlerRegistry, EventParserV2Service, EVENT_PARSER],
})
export class EventHandlersModule implements OnModuleInit {
  private readonly logger = new Logger(EventHandlersModule.name);

  constructor(
    private readonly registry: EventHandlerRegistry,
    private readonly configService: ConfigService,
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
    const handlers: IEventHandler[] = [
      this.raffleCreatedHandler,
      this.ticketPurchasedHandler,
      this.raffleFinalizedHandler,
      this.drawTriggeredHandler,
      this.randomnessRequestedHandler,
      this.randomnessReceivedHandler,
      this.raffleCancelledHandler,
      this.ticketRefundedHandler,
      this.contractPausedHandler,
      this.contractUnpausedHandler,
      this.adminTransferProposedHandler,
      this.adminTransferAcceptedHandler,
    ];

    for (const handler of handlers) {
      this.registry.registerDefaultHandler(handler);
    }

    // Validate the external handler config at boot and fail fast on bad config
    // so a typo can never silently disable ingestion.
    this.loadAndApplyConfig(handlers);
  }

  /**
   * Loads `config/event-handlers.json` (or the built-in default when absent),
   * validates it against the registered handlers, and registers the validated
   * contracts. Throws `ConfigValidationError` on invalid config.
   */
  private loadAndApplyConfig(handlers: IEventHandler[]): void {
    // Build the catalog of available handlers: class name -> event it handles.
    const availableHandlers = new Map<string, string>(
      handlers.map((h) => [h.constructor.name, h.eventName]),
    );
    const ctx = buildValidationContext(availableHandlers);

    const configPath = this.configService.get<string>(
      "EVENT_HANDLER_CONFIG_PATH",
      "config/event-handlers.json",
    );

    const raw = loadEventHandlerConfigFile(configPath);
    if (raw === null) {
      this.logger.warn(
        `No event handler config found at ${configPath}; using built-in defaults.`,
      );
    } else {
      this.logger.log(`Validating event handler configuration: ${configPath}`);
    }

    // Throws ConfigValidationError with all issues if the config is invalid.
    const config = assertValidEventHandlerConfig(
      raw ?? DEFAULT_EVENT_HANDLER_CONFIG,
      ctx,
    );

    for (const contract of config.contracts) {
      if (contract.enabled) {
        this.registry.registerContract(contract);
      }
    }

    this.logger.log(
      `Loaded ${config.contracts.filter((c) => c.enabled).length} enabled contract configuration(s)`,
    );
  }
}
