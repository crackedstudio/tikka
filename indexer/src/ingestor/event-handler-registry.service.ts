import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEventHandler, ContractConfig } from "./event-handler.interface";
import { xdr } from "@stellar/stellar-sdk";
import { DomainEvent } from "./event.types";
import { RawSorobanEvent } from "./event-parser.service";

/**
 * Registry for managing event handlers across multiple contracts
 * Supports dynamic registration and extensibility
 */
@Injectable()
export class EventHandlerRegistry implements OnModuleInit {
  private readonly logger = new Logger(EventHandlerRegistry.name);

  // Map: contractAddress -> eventName -> handler
  private readonly handlerMap = new Map<
    string,
    Map<string, IEventHandler>
  >();

  // Map: contractAddress -> ContractConfig
  private readonly contractConfigs = new Map<string, ContractConfig>();

  // Default handlers used when no contract-specific handler is found
  private readonly defaultHandlers = new Map<string, IEventHandler>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.loadConfiguration();
  }

  /**
   * Load contract configurations from config service or file
   */
  private async loadConfiguration(): Promise<void> {
    try {
      // Try to load from environment or config file
      const configPath = this.configService.get<string>(
        "EVENT_HANDLER_CONFIG_PATH",
        "config/event-handlers.json",
      );

      this.logger.log(`Loading event handler configuration from: ${configPath}`);

      // For now, we'll use a default configuration
      // In production, this would load from a file or database
      const defaultConfig = this.getDefaultConfiguration();

      for (const contract of defaultConfig.contracts) {
        if (contract.enabled) {
          this.registerContract(contract);
        }
      }

      this.logger.log(
        `Loaded ${this.contractConfigs.size} contract configurations`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fall back to default configuration
      this.loadDefaultHandlers();
    }
  }

  /**
   * Get default configuration (can be overridden by config file)
   */
  private getDefaultConfiguration(): { contracts: ContractConfig[] } {
    return {
      contracts: [
        {
          address: "default",
          version: "v1",
          description: "Default raffle contract",
          enabled: true,
          eventHandlers: {
            RaffleCreated: "RaffleCreatedHandler",
            TicketPurchased: "TicketPurchasedHandler",
            DrawTriggered: "DrawTriggeredHandler",
            RandomnessRequested: "RandomnessRequestedHandler",
            RandomnessReceived: "RandomnessReceivedHandler",
            RaffleFinalized: "RaffleFinalizedHandler",
            RaffleCancelled: "RaffleCancelledHandler",
            TicketRefunded: "TicketRefundedHandler",
            ContractPaused: "ContractPausedHandler",
            ContractUnpaused: "ContractUnpausedHandler",
            AdminTransferProposed: "AdminTransferProposedHandler",
            AdminTransferAccepted: "AdminTransferAcceptedHandler",
          },
        },
      ],
    };
  }

  /**
   * Load default handlers for backward compatibility
   */
  private loadDefaultHandlers(): void {
    this.logger.log("Loading default event handlers");
    // Default handlers will be loaded dynamically
  }

  /**
   * Register a contract and its event handlers
   */
  public registerContract(config: ContractConfig): void {
    this.logger.log(
      `Registering contract: ${config.address} (${config.version})`,
    );

    this.contractConfigs.set(config.address, config);

    if (!this.handlerMap.has(config.address)) {
      this.handlerMap.set(config.address, new Map());
    }

    // Register event handlers for this contract
    if (config.eventHandlers) {
      for (const [eventName, handlerName] of Object.entries(
        config.eventHandlers,
      )) {
        this.logger.debug(
          `  - Registering handler for ${eventName}: ${handlerName}`,
        );
      }
    }
  }

  /**
   * Register a specific event handler instance
   */
  public registerHandler(
    contractAddress: string,
    handler: IEventHandler,
  ): void {
    if (!this.handlerMap.has(contractAddress)) {
      this.handlerMap.set(contractAddress, new Map());
    }

    const handlers = this.handlerMap.get(contractAddress)!;
    handlers.set(handler.eventName, handler);

    this.logger.debug(
      `Registered handler for ${contractAddress}: ${handler.eventName}`,
    );
  }

  /**
   * Register a default handler (used when no contract-specific handler exists)
   */
  public registerDefaultHandler(handler: IEventHandler): void {
    this.defaultHandlers.set(handler.eventName, handler);
    this.logger.debug(`Registered default handler: ${handler.eventName}`);
  }

  /**
   * Get handler for a specific contract and event
   */
  public getHandler(
    contractAddress: string,
    eventName: string,
  ): IEventHandler | null {
    // Try contract-specific handler first
    const contractHandlers = this.handlerMap.get(contractAddress);
    if (contractHandlers?.has(eventName)) {
      return contractHandlers.get(eventName)!;
    }

    // Fall back to default handler
    if (this.defaultHandlers.has(eventName)) {
      return this.defaultHandlers.get(eventName)!;
    }

    return null;
  }

  /**
   * Check if a contract is registered
   */
  public isContractRegistered(contractAddress: string): boolean {
    return this.contractConfigs.has(contractAddress);
  }

  /**
   * Get contract configuration
   */
  public getContractConfig(contractAddress: string): ContractConfig | null {
    return this.contractConfigs.get(contractAddress) || null;
  }

  /**
   * Get all registered contracts
   */
  public getRegisteredContracts(): ContractConfig[] {
    return Array.from(this.contractConfigs.values());
  }

  /**
   * Parse an event using the appropriate handler
   */
  public parseEvent(
    contractAddress: string,
    eventName: string,
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    const handler = this.getHandler(contractAddress, eventName);

    if (!handler) {
      // Log as unhandled_supported if from known contract
      if (this.isContractRegistered(contractAddress)) {
        this.logger.debug(
          `Unhandled event from known contract ${contractAddress}: ${eventName}`,
        );
      } else {
        this.logger.debug(
          `Unknown event from unregistered contract ${contractAddress}: ${eventName}`,
        );
      }
      return null;
    }

    try {
      return handler.parse(topics, value, rawEvent);
    } catch (error) {
      this.logger.error(
        `Handler failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Dynamically register a contract at runtime
   */
  public registerContractAtRuntime(config: ContractConfig): void {
    this.logger.log(
      `Dynamically registering contract at runtime: ${config.address}`,
    );
    this.registerContract(config);
  }

  /**
   * Unregister a contract
   */
  public unregisterContract(contractAddress: string): void {
    this.contractConfigs.delete(contractAddress);
    this.handlerMap.delete(contractAddress);
    this.logger.log(`Unregistered contract: ${contractAddress}`);
  }
}
