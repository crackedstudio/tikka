/**
 * transactionPipeline.spec.ts
 *
 * Tests for runPipeline. Mocks sorobanRpcServer (rpcService),
 * signTransaction (walletService), and rpc.assembleTransaction at the module boundary.
 *
 * Framework: Vitest (globals: true, environment: jsdom)
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────
// vi.mock factories are hoisted — do NOT reference outer variables inside them.

vi.mock("../config/contract", () => ({
  CONTRACT_CONFIG: {
    address: "CTEST",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    functions: { createRaffle: "create_raffle", buyTicket: "buy_ticket" },
    constants: {},
  },
  validateContractConfig: vi.fn(),
}));

vi.mock("./rpcService", () => ({
  sorobanRpcServer: {
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
  },
  checkConnection: vi.fn(),
}));

vi.mock("./walletService", () => ({
  signTransaction: vi.fn(),
  getAccountAddress: vi.fn().mockResolvedValue("GTEST"),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  getKit: vi.fn(),
  getNetwork: vi.fn(),
  isWalletConnected: vi.fn(),
  isWalletInstalled: vi.fn(),
  setNetwork: vi.fn(),
  promptNetworkSwitch: vi.fn(),
}));

// Mock the SDK so assembleTransaction is controllable
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: vi.fn(),
      Api: actual.rpc.Api,
    },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { rpc } from "@stellar/stellar-sdk";
import { runPipeline } from "./transactionPipeline";
import type { PipelineProgressEvent, PipelineOptions } from "./transactionPipeline";
import { sorobanRpcServer } from "./rpcService";
import { signTransaction } from "./walletService";

// ─── Typed mock references ────────────────────────────────────────────────────

const mockSimulate    = vi.mocked(sorobanRpcServer.simulateTransaction);
const mockSend        = vi.mocked(sorobanRpcServer.sendTransaction);
const mockGetTx       = vi.mocked(sorobanRpcServer.getTransaction);
const mockSign        = vi.mocked(signTransaction);
const mockAssemble    = vi.mocked(rpc.assembleTransaction);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fakeTx      = { fee: "100", toEnvelope: vi.fn() } as unknown as import("@stellar/stellar-sdk").Transaction;
const assembledTx = { fee: "200", toEnvelope: vi.fn() } as unknown as import("@stellar/stellar-sdk").Transaction;

const successfulSim = { result: { retval: null }, minResourceFee: "100", transactionData: {} };

const buildOk = vi.fn().mockResolvedValue(fakeTx);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOk.mockResolvedValue(fakeTx);
    mockAssemble.mockReturnValue({ build: () => assembledTx } as ReturnType<typeof rpc.assembleTransaction>);
    vi.spyOn(rpc.Api, "isSimulationError").mockReturnValue(false);
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns ok:true with txHash on full success", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "TXHASH123", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 42 } as never);

    const result = await runPipeline(buildOk, { params: {}, options: { pollIntervalMs: 0 } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txHash).toBe("TXHASH123");
      expect(result.data.confirmedAt).toBe(42);
    }
  });

  it("fires onProgress events in order for happy path", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "TXHASH123", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const stages = events.map((e) => `${e.stage}:${e.status}`);
    expect(stages).toEqual([
      "BUILD:pending", "BUILD:done",
      "ESTIMATE:pending", "ESTIMATE:done",
      "SIGN:pending", "SIGN:done",
      "SUBMIT:pending", "SUBMIT:done",
      "POLL:pending", "POLL:done",
      "DONE:done",
    ]);
  });

  it("includes estimatedFee in ESTIMATE:done event", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const estimateDone = events.find((e) => e.stage === "ESTIMATE" && e.status === "done");
    expect(estimateDone).toBeDefined();
    if (estimateDone?.stage === "ESTIMATE" && estimateDone.status === "done") {
      expect(estimateDone.estimatedFee).toBeDefined();
    }
  });

  it("includes txHash in SUBMIT:done event", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "MYHASH", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const submitDone = events.find((e) => e.stage === "SUBMIT" && e.status === "done");
    expect(submitDone).toBeDefined();
    if (submitDone?.stage === "SUBMIT" && submitDone.status === "done") {
      expect(submitDone.txHash).toBe("MYHASH");
    }
  });

  // ── BUILD errors ────────────────────────────────────────────────────────────

  it("returns BUILD_FAILED when buildTx throws", async () => {
    const buildFail = vi.fn().mockRejectedValue(new Error("bad params"));
    const result = await runPipeline(buildFail, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BUILD_FAILED");
  });

  it("emits BUILD:error on build failure", async () => {
    const buildFail = vi.fn().mockRejectedValue(new Error("bad params"));
    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildFail, { params: {}, options: { onProgress: (e) => events.push(e) } });

    expect(events.some((e) => e.stage === "BUILD" && e.status === "error")).toBe(true);
  });

  // ── ESTIMATE errors ─────────────────────────────────────────────────────────

  it("returns SIMULATION_FAILED when simulateTransaction returns error", async () => {
    mockSimulate.mockResolvedValue({ error: "contract trap" } as never);
    vi.spyOn(rpc.Api, "isSimulationError").mockReturnValueOnce(true);

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIMULATION_FAILED");
  });

  it("returns SIMULATION_FAILED when simulateTransaction throws", async () => {
    mockSimulate.mockRejectedValue(new Error("network error"));

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIMULATION_FAILED");
  });

  // ── SIGN errors ─────────────────────────────────────────────────────────────

  it("returns USER_REJECTED when wallet rejects", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockRejectedValue(new Error("User rejected the request"));

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("USER_REJECTED");
  });

  it("returns USER_REJECTED when wallet cancels", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockRejectedValue(new Error("User cancelled"));

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("USER_REJECTED");
  });

  it("returns SIGNING_FAILED for non-rejection wallet errors", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockRejectedValue(new Error("wallet extension crashed"));

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNING_FAILED");
  });

  it("returns SIGNING_FAILED when signTransaction returns success:false", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: false, error: "hardware error" });

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNING_FAILED");
  });

  // ── SUBMIT errors ───────────────────────────────────────────────────────────

  it("returns SUBMISSION_FAILED when sendTransaction returns ERROR status", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ status: "ERROR", errorResult: "bad sequence" } as never);

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBMISSION_FAILED");
  });

  it("returns SUBMISSION_FAILED when sendTransaction throws", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockRejectedValue(new Error("connection refused"));

    const result = await runPipeline(buildOk, { params: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBMISSION_FAILED");
  });

  // ── POLL errors ─────────────────────────────────────────────────────────────

  it("returns FINALITY_FAILED when transaction fails on-chain", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "FAILHASH", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.FAILED } as never);

    const result = await runPipeline(buildOk, { params: {}, options: { pollIntervalMs: 0 } });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FINALITY_FAILED");
      if (result.error.code === "FINALITY_FAILED") {
        expect(result.error.txHash).toBe("FAILHASH");
      }
    }
  });

  it("returns TIMEOUT when polling deadline is exceeded", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "PENDINGHASH", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as never);

    const result = await runPipeline(buildOk, {
      params: {},
      options: { pollTimeoutMs: 10, pollIntervalMs: 0 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TIMEOUT");
  });

  // ── Options ─────────────────────────────────────────────────────────────────

  it("uses feeOverride in ESTIMATE:done event", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    const options: PipelineOptions = { feeOverride: "9999", onProgress: (e) => events.push(e), pollIntervalMs: 0 };

    await runPipeline(buildOk, { params: {}, options });

    const estimateDone = events.find((e) => e.stage === "ESTIMATE" && e.status === "done");
    if (estimateDone?.stage === "ESTIMATE" && estimateDone.status === "done") {
      expect(estimateDone.estimatedFee).toBe("9999");
    }
  });

  it("never throws — always returns a result union", async () => {
    const buildFail = vi.fn().mockRejectedValue(new Error("catastrophic"));
    await expect(runPipeline(buildFail, { params: {} })).resolves.toBeDefined();
  });

  // ── Failure at each stage: pipeline stops + error event emitted ─────────────

  it("BUILD failure: emits BUILD:error and no further stages run", async () => {
    const buildFail = vi.fn().mockRejectedValue(new Error("build error"));
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildFail, { params: {}, options: { onProgress: (e) => events.push(e) } });

    const stages = events.map((e) => e.stage);
    expect(events.some((e) => e.stage === "BUILD" && e.status === "error")).toBe(true);
    expect(stages).not.toContain("ESTIMATE");
    expect(stages).not.toContain("SIGN");
    expect(stages).not.toContain("SUBMIT");
    expect(stages).not.toContain("POLL");
    expect(mockSimulate).not.toHaveBeenCalled();
  });

  it("ESTIMATE failure: emits ESTIMATE:error and no further stages run", async () => {
    mockSimulate.mockRejectedValue(new Error("rpc down"));
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e) } });

    expect(events.some((e) => e.stage === "ESTIMATE" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("SIGN");
    expect(stages).not.toContain("SUBMIT");
    expect(stages).not.toContain("POLL");
    expect(mockSign).not.toHaveBeenCalled();
  });

  it("SIGN failure: emits SIGN:error and no further stages run", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockRejectedValue(new Error("User rejected the request"));
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e) } });

    expect(events.some((e) => e.stage === "SIGN" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("SUBMIT");
    expect(stages).not.toContain("POLL");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("SUBMIT failure: emits SUBMIT:error and no further stages run", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ status: "ERROR", errorResult: "bad seq" } as never);
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e) } });

    expect(events.some((e) => e.stage === "SUBMIT" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("POLL");
    expect(stages).not.toContain("DONE");
    expect(mockGetTx).not.toHaveBeenCalled();
  });

  it("POLL failure: emits POLL:error and DONE is not emitted", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.FAILED } as never);
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    expect(events.some((e) => e.stage === "POLL" && e.status === "error")).toBe(true);
    expect(events.some((e) => e.stage === "DONE")).toBe(false);
  });

  // ── Progress event payloads ─────────────────────────────────────────────────

  it("onProgress is optional — pipeline succeeds without it", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const result = await runPipeline(buildOk, { params: {}, options: { pollIntervalMs: 0 } });
    expect(result.ok).toBe(true);
  });

  it("ESTIMATE:done carries the assembled tx fee, not the raw sim fee", async () => {
    // assembledTx.fee = "200"; successfulSim.minResourceFee = "100"
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const e = events.find((e) => e.stage === "ESTIMATE" && e.status === "done")!;
    expect(e).toBeDefined();
    if (e.stage === "ESTIMATE" && e.status === "done") {
      expect(e.estimatedFee).toBe(assembledTx.fee); // "200", not "100"
    }
  });

  it("POLL:done carries confirmations: 1", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const e = events.find((e) => e.stage === "POLL" && e.status === "done")!;
    expect(e).toBeDefined();
    if (e.stage === "POLL" && e.status === "done") {
      expect(e.confirmations).toBe(1);
    }
  });

  it("DONE:done carries the same txHash as SUBMIT:done", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "CONSISTENT_HASH", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const submitDone = events.find((e) => e.stage === "SUBMIT" && e.status === "done")!;
    const done = events.find((e) => e.stage === "DONE")!;
    expect(done).toBeDefined();
    if (submitDone.stage === "SUBMIT" && submitDone.status === "done" && done.stage === "DONE") {
      expect(done.txHash).toBe(submitDone.txHash);
    }
  });

  it("each stage emits pending before done", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    for (const stage of ["BUILD", "ESTIMATE", "SIGN", "SUBMIT", "POLL"] as const) {
      const pendingIdx = events.findIndex((e) => e.stage === stage && e.status === "pending");
      const doneIdx    = events.findIndex((e) => e.stage === stage && e.status === "done");
      expect(pendingIdx).toBeGreaterThanOrEqual(0);
      expect(doneIdx).toBeGreaterThan(pendingIdx);
    }
  });

  it("error event status is exactly 'error', not 'done' or 'pending'", async () => {
    mockSimulate.mockRejectedValue(new Error("sim fail"));
    const events: PipelineProgressEvent[] = [];

    await runPipeline(buildOk, { params: {}, options: { onProgress: (e) => events.push(e) } });

    const errEvent = events.find((e) => e.stage === "ESTIMATE" && e.status === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent?.status).toBe("error");
  });

  // ── Configuration ───────────────────────────────────────────────────────────

  it("feeOverride replaces the assembled tx fee in ESTIMATE:done", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const events: PipelineProgressEvent[] = [];
    await runPipeline(buildOk, { params: {}, options: { feeOverride: "42", onProgress: (e) => events.push(e), pollIntervalMs: 0 } });

    const e = events.find((e) => e.stage === "ESTIMATE" && e.status === "done")!;
    if (e.stage === "ESTIMATE" && e.status === "done") {
      expect(e.estimatedFee).toBe("42");
      expect(e.estimatedFee).not.toBe(assembledTx.fee);
    }
  });

  it("pollTimeoutMs: short timeout causes TIMEOUT before first successful poll", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    // Always NOT_FOUND so it never resolves
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as never);

    const result = await runPipeline(buildOk, {
      params: {},
      options: { pollTimeoutMs: 1, pollIntervalMs: 0 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TIMEOUT");
  });

  it("pollTimeoutMs: long enough timeout allows success", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    const result = await runPipeline(buildOk, {
      params: {},
      options: { pollTimeoutMs: 10_000, pollIntervalMs: 0 },
    });

    expect(result.ok).toBe(true);
  });

  it("pollIntervalMs: getTransaction is called after each interval", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    // NOT_FOUND twice, then SUCCESS
    mockGetTx
      .mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as never)
      .mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.NOT_FOUND } as never)
      .mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 5 } as never);

    const result = await runPipeline(buildOk, {
      params: {},
      options: { pollTimeoutMs: 10_000, pollIntervalMs: 0 },
    });

    expect(result.ok).toBe(true);
    expect(mockGetTx).toHaveBeenCalledTimes(3);
  });

  it("no options object: pipeline runs with defaults and succeeds", async () => {
    mockSimulate.mockResolvedValue(successfulSim as never);
    mockSign.mockResolvedValue({ success: true, signedTransaction: assembledTx });
    mockSend.mockResolvedValue({ hash: "H", status: "PENDING" } as never);
    mockGetTx.mockResolvedValue({ status: rpc.Api.GetTransactionStatus.SUCCESS, ledger: 1 } as never);

    // No options at all — exercises default pollTimeoutMs / pollIntervalMs
    const result = await runPipeline(buildOk, { params: {} });
    expect(result.ok).toBe(true);
  });
});
