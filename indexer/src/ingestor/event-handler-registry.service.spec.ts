import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EventHandlerRegistry } from "./event-handler-registry.service";
import { IEventHandler, ContractConfig } from "./event-handler.interface";
import { xdr } from "@stellar/stellar-sdk";
import { DomainEvent } from "./event.types";
import { RawSorobanEvent } from "./event-parser.service";

// Mock handler for testing
class MockEventHandler implements IEventHandler {
  constructor(public readonly eventName: string, private readonly tag: string = "v1") {}

  parse(
    _topics: xdr.ScVal[],
    _value: xdr.ScVal,
    _rawEvent: RawSorobanEvent,
  ): DomainEvent | null {
    return {
      type: "RaffleCreated" as const,
      raffle_id: 1,
      creator: "test",
      params: {
        ticket_price: "0",
        max_tickets: 0,
        end_time: 0,
        asset: this.tag,
        metadata_cid: "",
        allow_multiple: true,
      },
    };
  }
}

describe("EventHandlerRegistry", () => {
  let registry: EventHandlerRegistry;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventHandlerRegistry,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("config/event-handlers.json"),
          },
        },
      ],
    }).compile();

    registry = module.get<EventHandlerRegistry>(EventHandlerRegistry);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("Contract Registration", () => {
    it("should register a contract", () => {
      const config: ContractConfig = {
        address: "TEST_CONTRACT",
        version: "v1",
        enabled: true,
        eventHandlers: {
          TestEvent: "TestEventHandler",
        },
      };

      registry.registerContract(config);

      expect(registry.isContractRegistered("TEST_CONTRACT")).toBe(true);
    });

    it("should get contract configuration", () => {
      const config: ContractConfig = {
        address: "TEST_CONTRACT",
        version: "v1",
        description: "Test contract",
        enabled: true,
      };

      registry.registerContract(config);

      const retrieved = registry.getContractConfig("TEST_CONTRACT");
      expect(retrieved).toEqual(config);
    });

    it("should unregister a contract", () => {
      const config: ContractConfig = {
        address: "TEST_CONTRACT",
        version: "v1",
        enabled: true,
      };

      registry.registerContract(config);
      expect(registry.isContractRegistered("TEST_CONTRACT")).toBe(true);

      registry.unregisterContract("TEST_CONTRACT");
      expect(registry.isContractRegistered("TEST_CONTRACT")).toBe(false);
    });

    it("should register contract at runtime", () => {
      const config: ContractConfig = {
        address: "RUNTIME_CONTRACT",
        version: "v1",
        enabled: true,
      };

      registry.registerContractAtRuntime(config);

      expect(registry.isContractRegistered("RUNTIME_CONTRACT")).toBe(true);
    });
  });

  describe("Handler Registration", () => {
    it("should register a handler for a contract", () => {
      const handler = new MockEventHandler("TestEvent");

      registry.registerHandler("TEST_CONTRACT", handler);

      const retrieved = registry.getHandler("TEST_CONTRACT", "TestEvent");
      expect(retrieved).toBe(handler);
    });

    it("should register a default handler", () => {
      const handler = new MockEventHandler("DefaultEvent");

      registry.registerDefaultHandler(handler);

      const retrieved = registry.getHandler("ANY_CONTRACT", "DefaultEvent");
      expect(retrieved).toBe(handler);
    });

    it("should prioritize contract-specific handler over default", () => {
      const defaultHandler = new MockEventHandler("TestEvent");
      const contractHandler = new MockEventHandler("TestEvent");

      registry.registerDefaultHandler(defaultHandler);
      registry.registerHandler("TEST_CONTRACT", contractHandler);

      const retrieved = registry.getHandler("TEST_CONTRACT", "TestEvent");
      expect(retrieved).toBe(contractHandler);
    });

    it("should return null for unregistered handler", () => {
      const retrieved = registry.getHandler("UNKNOWN_CONTRACT", "UnknownEvent");
      expect(retrieved).toBeNull();
    });
  });

  describe("Event Parsing", () => {
    it("should parse event using registered handler", () => {
      const handler = new MockEventHandler("TestEvent");
      registry.registerHandler("TEST_CONTRACT", handler);

      const mockTopics: xdr.ScVal[] = [];
      const mockValue = {} as xdr.ScVal;
      const mockRawEvent = {} as RawSorobanEvent;

      const result = registry.parseEvent(
        "TEST_CONTRACT",
        "TestEvent",
        1,
        mockTopics,
        mockValue,
        mockRawEvent,
      );

      expect(result).toBeDefined();
      expect(result?.type).toBe("RaffleCreated");
    });

    it("should return null for unhandled event from known contract", () => {
      const config: ContractConfig = {
        address: "KNOWN_CONTRACT",
        version: "v1",
        enabled: true,
      };

      registry.registerContract(config);

      const mockTopics: xdr.ScVal[] = [];
      const mockValue = {} as xdr.ScVal;
      const mockRawEvent = {} as RawSorobanEvent;

      const result = registry.parseEvent(
        "KNOWN_CONTRACT",
        "UnhandledEvent",
        1,
        mockTopics,
        mockValue,
        mockRawEvent,
      );

      expect(result).toBeNull();
    });

    it("should return null for event from unknown contract", () => {
      const mockTopics: xdr.ScVal[] = [];
      const mockValue = {} as xdr.ScVal;
      const mockRawEvent = {} as RawSorobanEvent;

      const result = registry.parseEvent(
        "UNKNOWN_CONTRACT",
        "SomeEvent",
        1,
        mockTopics,
        mockValue,
        mockRawEvent,
      );

      expect(result).toBeNull();
    });
  });

  describe("Contract Listing", () => {
    it("should return all registered contracts", () => {
      const config1: ContractConfig = {
        address: "CONTRACT_1",
        version: "v1",
        enabled: true,
      };

      const config2: ContractConfig = {
        address: "CONTRACT_2",
        version: "v2",
        enabled: true,
      };

      registry.registerContract(config1);
      registry.registerContract(config2);

      const contracts = registry.getRegisteredContracts();
      expect(contracts).toHaveLength(2);
      expect(contracts).toContainEqual(config1);
      expect(contracts).toContainEqual(config2);
    });

    it("should return empty array when no contracts registered", () => {
      const contracts = registry.getRegisteredContracts();
      expect(contracts).toEqual([]);
    });
  });

  describe("Schema Version Routing", () => {
    it("routes handlers by schema version for same contract and event", () => {
      const v1Handler = new MockEventHandler("TestEvent", "v1");
      const v2Handler = new MockEventHandler("TestEvent", "v2");

      registry.registerHandler("TEST_CONTRACT", v1Handler, 1);
      registry.registerHandler("TEST_CONTRACT", v2Handler, 2);

      const mockTopics: xdr.ScVal[] = [];
      const mockValue = {} as xdr.ScVal;
      const mockRawEvent = {} as RawSorobanEvent;

      const resultV1 = registry.parseEvent(
        "TEST_CONTRACT",
        "TestEvent",
        1,
        mockTopics,
        mockValue,
        mockRawEvent,
      );
      const resultV2 = registry.parseEvent(
        "TEST_CONTRACT",
        "TestEvent",
        2,
        mockTopics,
        mockValue,
        mockRawEvent,
      );

      expect(resultV1?.type).toBe("RaffleCreated");
      expect(resultV2?.type).toBe("RaffleCreated");
      expect((resultV1 as any)?.params.asset).toBe("v1");
      expect((resultV2 as any)?.params.asset).toBe("v2");
      expect(resultV1?.schemaVersion).toBe(1);
      expect(resultV2?.schemaVersion).toBe(2);
    });
  });
});
