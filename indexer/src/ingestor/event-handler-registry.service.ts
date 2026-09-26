import { Injectable, Logger } from "@nestjs/common";
import { IEventHandler, ContractConfig } from "./event-handler.interface";
import { xdr } from "@stellar/stellar-sdk";
import { DomainEvent } from "./event.types";
import { RawSorobanEvent } from "./event-parser.interface";

/**
 * Registry for managing event handlers across multiple contracts
 * Supports dynamic registration and extensibility.
 *
 * Configuration loading and validation is owned by `EventHandlersModule`,
 * which validates `config/event-handlers.json` at boot (failing fast on bad
 * config) and then calls {@link registerContract} for each validated contract.
 */
@Injectable()
export class EventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerRegistry.name);

  // Map: contractAddress -> eventName -> schemaVersion -> handler
  private readonly handlerMap = new Map<
    string,
    Map<string, Map<number, IEventHandler>>
  >();

  // Map: contractAddress -> ContractConfig
  private readonly contractConfigs = new Map<string, ContractConfig>();

  // Default handlers used when no contract-specific handler is found
  private readonly defaultHandlers = new Map<string, IEventHandler>();

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
    schemaVersion = 1,
  ): void {
    if (!this.handlerMap.has(contractAddress)) {
      this.handlerMap.set(contractAddress, new Map());
    }

    const handlersByEvent = this.handlerMap.get(contractAddress)!;
    if (!handlersByEvent.has(handler.eventName)) {
      handlersByEvent.set(handler.eventName, new Map());
    }
    handlersByEvent.get(handler.eventName)!.set(schemaVersion, handler);

    this.logger.debug(
      `Registered handler for ${contractAddress}: ${handler.eventName}@v${schemaVersion}`,
    );
  }

  /**
   * Register a default handler (used when no contract-specific handler exists).
   *
   * Every topic has exactly **one** default handler: registering a *different*
   * handler for a topic that is already claimed throws, so which handler wins
   * can never depend on module-init order (a silent `Map.set` would let a
   * later registration shadow an earlier one). Re-registering the *same*
   * instance is a no-op, which keeps `onModuleInit` idempotent.
   */
  public registerDefaultHandler(handler: IEventHandler): void {
    const existing = this.defaultHandlers.get(handler.eventName);

    if (existing && existing !== handler) {
      throw new Error(
        `Duplicate default handler for event "${handler.eventName}": ` +
          `${existing.constructor.name} already claims it, ` +
          `${handler.constructor.name} cannot also claim it.`,
      );
    }

    this.defaultHandlers.set(handler.eventName, handler);
    this.logger.debug(`Registered default handler: ${handler.eventName}`);
  }

  /**
   * Topics that currently have a default handler, in registration order.
   * Used by tests and health checks to assert the registered set is exactly
   * the expected set of contract event topics.
   */
  public getDefaultHandlerTopics(): string[] {
    return Array.from(this.defaultHandlers.keys());
  }

  /**
   * Get handler for a specific contract and event
   */
  public getHandler(
    contractAddress: string,
    eventName: string,
    schemaVersion = 1,
  ): IEventHandler | null {
    // Try contract-specific handler first
    const contractHandlers = this.handlerMap.get(contractAddress)?.get(eventName);
    if (contractHandlers?.has(schemaVersion)) {
      return contractHandlers.get(schemaVersion)!;
    }

    // Fallback to v1 handler for compatibility when specific version is absent
    if (contractHandlers?.has(1)) {
      return contractHandlers.get(1)!;
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
    schemaVersion: number,
    topics: xdr.ScVal[],
    value: xdr.ScVal,
    rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    const handler = this.getHandler(contractAddress, eventName, schemaVersion);

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
      const parsed = handler.parse(topics, value, rawEvent);
      if (!parsed) return null;
      // Prefer the version the handler resolved; fall back to the routing
      // version so every parsed event carries a schema version.
      return { ...parsed, schemaVersion: parsed.schemaVersion ?? schemaVersion };
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
