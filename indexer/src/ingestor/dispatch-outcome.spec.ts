import { DeadLetterQueueService } from "./dead-letter-queue.service";
import { DispatchAttemptContext, DispatchOutcomeClassifier } from "./dispatch-outcome";
import { DomainEvent } from "./event.types";

const raw = { id: "tx-1", ledger: 12 };
const event: DomainEvent = {
  type: "TicketPurchased",
  schemaVersion: 1,
  raffle_id: 1,
  buyer: "GBUYER",
  ticket_ids: [1],
  total_paid: "100",
};

function makeContext(overrides: Partial<DispatchAttemptContext> = {}): DispatchAttemptContext {
  return {
    handlerName: "TicketProcessor.handleTicketPurchased",
    eventId: "tx-1",
    event,
    raw,
    ledger: 12,
    txHash: "tx-1",
    schemaVersion: 1,
    startedAt: Date.now(),
    successOutcome: "succeeded",
    ...overrides,
  };
}

function makeClassifier(dlq = new DeadLetterQueueService()) {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    classifier: new DispatchOutcomeClassifier(logger as never, dlq),
    dlq,
    logger,
  };
}

describe("DispatchOutcomeClassifier", () => {
  const originalRetries = process.env.MAX_DISPATCH_RETRIES;
  const originalDelay = process.env.BASE_RETRY_DELAY_MS;

  beforeEach(() => {
    process.env.BASE_RETRY_DELAY_MS = "0";
  });

  afterEach(() => {
    if (originalRetries === undefined) {
      delete process.env.MAX_DISPATCH_RETRIES;
    } else {
      process.env.MAX_DISPATCH_RETRIES = originalRetries;
    }

    if (originalDelay === undefined) {
      delete process.env.BASE_RETRY_DELAY_MS;
    } else {
      process.env.BASE_RETRY_DELAY_MS = originalDelay;
    }
  });

  it("returns the configured success outcome after applying once", async () => {
    const { classifier, dlq } = makeClassifier();
    const apply = jest.fn().mockResolvedValue(undefined);

    const result = await classifier.run(
      makeContext({ successOutcome: "skipped" }),
      apply,
    );

    expect(result).toMatchObject({ outcome: "skipped", eventId: "tx-1" });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(dlq.getRecords()).toHaveLength(0);
  });

  it("retries handler failures before succeeding", async () => {
    process.env.MAX_DISPATCH_RETRIES = "2";
    const { classifier, logger } = makeClassifier();
    const apply = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(undefined);

    const result = await classifier.run(makeContext(), apply);

    expect(result.outcome).toBe("succeeded");
    expect(apply).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Dispatch attempt 1/2 failed"),
    );
  });

  it("dead-letters unsupported schema versions without applying", async () => {
    const { classifier, dlq } = makeClassifier();
    const apply = jest.fn();

    const result = await classifier.run(
      makeContext({ schemaVersion: 99 }),
      apply,
    );

    expect(result.outcome).toBe("failed");
    expect(apply).not.toHaveBeenCalled();
    expect(dlq.getRecords()[0]).toMatchObject({
      reason: "SCHEMA_UNSUPPORTED",
      schemaVersion: 99,
    });
  });

  it("dead-letters exhausted handler failures", async () => {
    process.env.MAX_DISPATCH_RETRIES = "1";
    const { classifier, dlq } = makeClassifier();

    const result = await classifier.run(
      makeContext(),
      jest.fn().mockRejectedValue(new Error("write failed")),
    );

    expect(result.outcome).toBe("failed");
    expect(dlq.getRecords()[0]).toMatchObject({
      reason: "HANDLER_ERROR",
      attemptCount: 1,
      errorMessage: "write failed",
    });
  });
});