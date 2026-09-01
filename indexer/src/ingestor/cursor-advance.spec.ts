import { CursorAdvance } from "./cursor-advance";

function makeRunner() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      createQueryBuilder: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ identifiers: [{}] }),
      })),
    },
  };
}

function makeAdvance() {
  const runner = makeRunner();
  const dataSource = { createQueryRunner: jest.fn(() => runner) };
  const raffleProcessor = {
    handleRaffleCreated: jest.fn().mockResolvedValue(runner),
    handleRaffleFinalized: jest.fn().mockResolvedValue(runner),
    handleRaffleCancelled: jest.fn().mockResolvedValue(runner),
  };
  const ticketProcessor = {
    handleTicketPurchased: jest.fn().mockResolvedValue(undefined),
    handleTicketRefunded: jest.fn().mockResolvedValue(undefined),
  };
  const adminProcessor = {
    handleContractPaused: jest.fn().mockResolvedValue(undefined),
    handleContractUnpaused: jest.fn().mockResolvedValue(undefined),
    handleAdminTransferProposed: jest.fn().mockResolvedValue(undefined),
    handleAdminTransferAccepted: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { log: jest.fn(), warn: jest.fn() };

  return {
    advance: new CursorAdvance(
      dataSource as never,
      raffleProcessor as never,
      ticketProcessor as never,
      adminProcessor as never,
      logger as never,
    ),
    dataSource,
    runner,
    raffleProcessor,
    ticketProcessor,
    adminProcessor,
    logger,
  };
}

describe("CursorAdvance", () => {
  it("commits and releases a runner returned by a raffle processor", async () => {
    const { advance, runner, raffleProcessor } = makeAdvance();

    await advance.apply(
      {
        type: "RaffleCancelled",
        schemaVersion: 1,
        raffle_id: 7,
        reason: "expired",
      },
      { ledger: 22, id: "tx-22" },
    );

    expect(raffleProcessor.handleRaffleCancelled).toHaveBeenCalledWith(
      7,
      "expired",
      22,
      "tx-22",
      1,
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it("wraps ticket events in a transaction", async () => {
    const { advance, dataSource, runner, ticketProcessor } = makeAdvance();

    await advance.apply(
      {
        type: "TicketPurchased",
        schemaVersion: 1,
        raffle_id: 3,
        buyer: "GBUYER",
        ticket_ids: [10, 11],
        total_paid: "200",
      },
      { ledger: 30, id: "tx-30" },
    );

    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(runner.connect).toHaveBeenCalledTimes(1);
    expect(runner.startTransaction).toHaveBeenCalledTimes(1);
    expect(ticketProcessor.handleTicketPurchased).toHaveBeenCalledWith(
      3,
      "GBUYER",
      [10, 11],
      "200",
      30,
      "tx-30",
      runner,
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases ticket transactions on failure", async () => {
    const { advance, runner, ticketProcessor } = makeAdvance();
    ticketProcessor.handleTicketPurchased.mockRejectedValueOnce(
      new Error("ticket failed"),
    );

    await expect(
      advance.apply(
        {
          type: "TicketPurchased",
          schemaVersion: 1,
          raffle_id: 3,
          buyer: "GBUYER",
          ticket_ids: [10],
          total_paid: "100",
        },
        { ledger: 30, id: "tx-30" },
      ),
    ).rejects.toThrow("ticket failed");

    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });

  it("logs non-mutating randomness events without opening a runner", async () => {
    const { advance, dataSource, logger } = makeAdvance();

    await advance.apply(
      {
        type: "RandomnessRequested",
        schemaVersion: 1,
        raffle_id: 2,
        request_id: 9,
      },
      { ledger: 40, id: "tx-40" },
    );

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      "RandomnessRequested for raffle 2, request ID 9",
    );
  });
});