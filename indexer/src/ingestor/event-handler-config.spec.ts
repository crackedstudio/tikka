import {
  validateEventHandlerConfig,
  assertValidEventHandlerConfig,
  buildValidationContext,
  ConfigValidationError,
  ConfigValidationContext,
  RootHandlerConfig,
} from "./event-handler-config";

// Catalog mirroring the standard registered handlers: class name -> event.
const AVAILABLE_HANDLERS = new Map<string, string>([
  ["RaffleCreatedHandler", "RaffleCreated"],
  ["TicketPurchasedHandler", "TicketPurchased"],
  ["DrawTriggeredHandler", "DrawTriggered"],
  ["RandomnessRequestedHandler", "RandomnessRequested"],
  ["RandomnessReceivedHandler", "RandomnessReceived"],
  ["RaffleFinalizedHandler", "RaffleFinalized"],
  ["RaffleCancelledHandler", "RaffleCancelled"],
  ["TicketRefundedHandler", "TicketRefunded"],
  ["ContractPausedHandler", "ContractPaused"],
  ["ContractUnpausedHandler", "ContractUnpaused"],
  ["AdminTransferProposedHandler", "AdminTransferProposed"],
  ["AdminTransferAcceptedHandler", "AdminTransferAccepted"],
]);

const ctx: ConfigValidationContext = buildValidationContext(AVAILABLE_HANDLERS);

function validConfig(): RootHandlerConfig {
  return {
    contracts: [
      {
        address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        version: "v1",
        description: "Main raffle contract",
        enabled: true,
        eventHandlers: {
          RaffleCreated: "RaffleCreatedHandler",
          TicketPurchased: "TicketPurchasedHandler",
        },
      },
    ],
    defaultHandlers: {
      RaffleCreated: "RaffleCreatedHandler",
    },
  };
}

describe("validateEventHandlerConfig", () => {
  describe("valid config", () => {
    it("returns no issues for a valid config", () => {
      expect(validateEventHandlerConfig(validConfig(), ctx)).toEqual([]);
    });

    it("assertValid returns the typed config", () => {
      const config = validConfig();
      expect(assertValidEventHandlerConfig(config, ctx)).toBe(config);
    });

    it("does not reference-check disabled contracts (templates allowed)", () => {
      const config: RootHandlerConfig = {
        contracts: [
          {
            address: "THIRD_PARTY",
            version: "v1",
            enabled: false,
            eventHandlers: {
              // Neither the event nor the handler is known, but the contract
              // is disabled so it must not fail validation.
              SomeCustomEvent: "NotRegisteredHandler",
            },
          },
        ],
      };
      expect(validateEventHandlerConfig(config, ctx)).toEqual([]);
    });
  });

  describe("missing handler", () => {
    it("flags a handler that does not exist", () => {
      const config = validConfig();
      config.contracts[0].eventHandlers = {
        RaffleCreated: "NonExistentHandler",
      };

      const issues = validateEventHandlerConfig(config, ctx);
      expect(issues.some((i) => i.includes('handler "NonExistentHandler"'))).toBe(
        true,
      );
      expect(issues.some((i) => i.includes("does not exist"))).toBe(true);
    });

    it("throws ConfigValidationError via assertValid", () => {
      const config = validConfig();
      config.contracts[0].eventHandlers = { RaffleCreated: "NopeHandler" };
      expect(() => assertValidEventHandlerConfig(config, ctx)).toThrow(
        ConfigValidationError,
      );
    });
  });

  describe("unknown event", () => {
    it("flags an event name the indexer does not recognise", () => {
      const config = validConfig();
      config.contracts[0].eventHandlers = {
        TotallyUnknownEvent: "RaffleCreatedHandler",
      };

      const issues = validateEventHandlerConfig(config, ctx);
      expect(
        issues.some((i) => i.includes('unknown event "TotallyUnknownEvent"')),
      ).toBe(true);
    });
  });

  describe("invalid version", () => {
    it("flags an unsupported contract version", () => {
      const config = validConfig();
      config.contracts[0].version = "v99";

      const issues = validateEventHandlerConfig(config, ctx);
      expect(issues.some((i) => i.includes('"v99" is not supported'))).toBe(true);
    });

    it("flags a non-string version", () => {
      const config = validConfig();
      (config.contracts[0] as { version: unknown }).version = 1;

      const issues = validateEventHandlerConfig(config, ctx);
      expect(issues.some((i) => i.includes("version must be a string"))).toBe(
        true,
      );
    });
  });

  describe("handler/event mismatch", () => {
    it("flags a handler mapped to the wrong event", () => {
      const config = validConfig();
      config.contracts[0].eventHandlers = {
        // Real handler, known event, but the handler handles RaffleCreated.
        TicketPurchased: "RaffleCreatedHandler",
      };

      const issues = validateEventHandlerConfig(config, ctx);
      expect(
        issues.some((i) =>
          i.includes('handles "RaffleCreated", not "TicketPurchased"'),
        ),
      ).toBe(true);
    });
  });

  describe("structural validation", () => {
    it("rejects a non-object root", () => {
      expect(validateEventHandlerConfig(null, ctx)).toEqual([
        "config root must be an object",
      ]);
      expect(validateEventHandlerConfig("nope", ctx)).toEqual([
        "config root must be an object",
      ]);
    });

    it("rejects a non-array contracts field", () => {
      const issues = validateEventHandlerConfig({ contracts: {} }, ctx);
      expect(issues).toContain("`contracts` must be an array");
    });

    it("rejects a contract with an empty address", () => {
      const config = validConfig();
      config.contracts[0].address = "";
      const issues = validateEventHandlerConfig(config, ctx);
      expect(
        issues.some((i) => i.includes("address must be a non-empty string")),
      ).toBe(true);
    });

    it("rejects a non-boolean enabled flag", () => {
      const config = validConfig();
      (config.contracts[0] as { enabled: unknown }).enabled = "yes";
      const issues = validateEventHandlerConfig(config, ctx);
      expect(issues.some((i) => i.includes("enabled must be a boolean"))).toBe(
        true,
      );
    });

    it("validates defaultHandlers references", () => {
      const config = validConfig();
      config.defaultHandlers = { RaffleCreated: "GhostHandler" };
      const issues = validateEventHandlerConfig(config, ctx);
      expect(
        issues.some(
          (i) => i.includes("defaultHandlers") && i.includes("does not exist"),
        ),
      ).toBe(true);
    });
  });

  describe("ConfigValidationError", () => {
    it("lists every issue in the message", () => {
      const config = validConfig();
      config.contracts[0].version = "v99";
      config.contracts[0].eventHandlers = { Bogus: "GhostHandler" };

      let err: ConfigValidationError | undefined;
      try {
        assertValidEventHandlerConfig(config, ctx);
      } catch (e) {
        err = e as ConfigValidationError;
      }

      expect(err).toBeInstanceOf(ConfigValidationError);
      expect(err!.issues.length).toBeGreaterThanOrEqual(2);
      expect(err!.message).toContain("v99");
      expect(err!.message).toContain("GhostHandler");
    });
  });
});
