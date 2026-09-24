/**
 * transactionPipeline.spec.ts
 *
 * Tests for runPipeline, now driving the @tikka/sdk ContractService stage
 * methods (simulate → sign → submit → poll). A fake SdkPipelineTarget stands in
 * for the SDK transport, while TikkaSdkError/TikkaSdkErrorCode come from the
 * real SDK so err.code classification matches production.
 *
 * Framework: Vitest (globals: true, environment: jsdom)
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { TikkaSdkError, TikkaSdkErrorCode } from "@tikka/sdk";
import { runPipeline, sdkErrorToPipelineError } from "./transactionPipeline";
import type { PipelineProgressEvent, SdkPipelineTarget } from "./transactionPipeline";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTarget() {
  return {
    simulate: vi.fn(),
    sign: vi.fn(),
    submit: vi.fn(),
    poll: vi.fn(),
  };
}

const successSim = {
  returnValue: null,
  minResourceFee: "100",
  assembledXdr: "AAAAABCDEF",
  networkPassphrase: "Test SDF Network ; September 2015",
};

const successPoll = (overrides: Partial<import("@tikka/sdk").SubmitResult> = {}) => ({
  returnValue: 1,
  txHash: "POLLHASH",
  ledger: 42,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runPipeline", () => {
  let target: ReturnType<typeof makeTarget>;

  beforeEach(() => {
    target = makeTarget();
    target.simulate.mockResolvedValue(successSim as never);
    target.sign.mockResolvedValue("SIGNED_XDR");
    target.submit.mockResolvedValue("TXHASH123");
    target.poll.mockResolvedValue(successPoll() as never);
  });

  const run = (input: Partial<Parameters<typeof runPipeline>[0]> = {}) =>
    runPipeline({
      target: target as unknown as SdkPipelineTarget,
      method: "create_raffle",
      params: [],
      options: { pollIntervalMs: 0 },
      ...input,
    } as Parameters<typeof runPipeline>[0]);

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns ok:true with txHash on full success", async () => {
    const result = await run();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.txHash).toBe("POLLHASH");
      expect(result.data.confirmedAt).toBe(42);
    }
  });

  it("fires onProgress events in order for happy path", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

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

  it("includes estimatedFee (SDK minResourceFee) in ESTIMATE:done event", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

    const estimateDone = events.find((e) => e.stage === "ESTIMATE" && e.status === "done");
    expect(estimateDone?.status).toBe("done");
    if (estimateDone?.stage === "ESTIMATE" && estimateDone.status === "done") {
      expect(estimateDone.estimatedFee).toBe("100");
    }
  });

  it("feeOverride replaces the SDK fee in ESTIMATE:done", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { feeOverride: "42", onProgress: (e) => events.push(e) } });

    const e = events.find((e) => e.stage === "ESTIMATE" && e.status === "done");
    if (e?.stage === "ESTIMATE" && e.status === "done") {
      expect(e.estimatedFee).toBe("42");
    }
  });

  it("includes txHash in SUBMIT:done event", async () => {
    target.submit.mockResolvedValue("MYHASH");
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

    const submitDone = events.find((e) => e.stage === "SUBMIT" && e.status === "done");
    if (submitDone?.stage === "SUBMIT" && submitDone.status === "done") {
      expect(submitDone.txHash).toBe("MYHASH");
    }
  });

  it("passes method + params to simulate", async () => {
    await run({ method: "buy_ticket", params: [1, "GX", 2] });

    expect(target.simulate).toHaveBeenCalledWith("buy_ticket", [1, "GX", 2]);
  });

  it("signs the SDK-assembled XDR with the returned passphrase", async () => {
    await run();

    expect(target.sign).toHaveBeenCalledWith("AAAAABCDEF", "Test SDF Network ; September 2015");
  });

  it("submits the signed XDR from the SDK sign phase", async () => {
    await run();

    expect(target.submit).toHaveBeenCalledWith("SIGNED_XDR");
  });

  it("polls the submitted hash with the timeout/interval options", async () => {
    await run({ options: { pollTimeoutMs: 500, pollIntervalMs: 100 } });

    expect(target.poll).toHaveBeenCalledWith("TXHASH123", { timeoutMs: 500, intervalMs: 100 });
  });

  // ── ESTIMATE errors ─────────────────────────────────────────────────────────

  it("returns SIMULATION_FAILED when simulate throws a plain Error", async () => {
    target.simulate.mockRejectedValue(new Error("rpc down"));

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIMULATION_FAILED");
  });

  it("returns SIMULATION_FAILED when simulate throws an SDK SimulationFailed error", async () => {
    target.simulate.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, "Simulation failed for create_raffle"),
    );

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIMULATION_FAILED");
  });

  it("returns INSUFFICIENT_FEES when the simulation error mentions insufficient funds", async () => {
    target.simulate.mockRejectedValue(new Error("Insufficient balance to cover fee"));

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INSUFFICIENT_FEES");
  });

  // ── SIGN errors ─────────────────────────────────────────────────────────────

  it("returns USER_REJECTED when the SDK maps the sign failure to UserRejected", async () => {
    target.sign.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.UserRejected, "Wallet sign failed: User rejected the request"),
    );

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("USER_REJECTED");
  });

  it("returns SIGNING_FAILED for plain wallet errors", async () => {
    target.sign.mockRejectedValue(new Error("wallet extension crashed"));

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNING_FAILED");
  });

  it("returns SIGNING_FAILED for a WalletNotConnected SDK error", async () => {
    target.sign.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.WalletNotInstalled, "No wallet adapter set"),
    );

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SIGNING_FAILED");
  });

  // ── SUBMIT errors ───────────────────────────────────────────────────────────

  it("returns SUBMISSION_FAILED when submit throws", async () => {
    target.submit.mockRejectedValue(new Error("connection refused"));

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBMISSION_FAILED");
  });

  it("returns SUBMISSION_FAILED for an SDK SubmissionFailed error", async () => {
    target.submit.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.SubmissionFailed, "Transaction rejected"),
    );

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUBMISSION_FAILED");
  });

  // ── POLL errors ─────────────────────────────────────────────────────────────

  it("returns TIMEOUT when the SDK poll throws a Timeout error (txHash set)", async () => {
    target.submit.mockResolvedValue("PENDINGHASH");
    target.poll.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.Timeout, "Timed out waiting for finality"),
    );

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TIMEOUT");
      if (result.error.code === "TIMEOUT") {
        expect(result.error.txHash).toBe("PENDINGHASH");
      }
    }
  });

  it("returns FINALITY_FAILED when the SDK poll otherwise fails (txHash set)", async () => {
    target.submit.mockResolvedValue("FAILHASH");
    target.poll.mockRejectedValue(new Error("transaction failed on-chain"));

    const result = await run();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FINALITY_FAILED");
      if (result.error.code === "FINALITY_FAILED") {
        expect(result.error.txHash).toBe("FAILHASH");
      }
    }
  });

  // ── Failure at each stage: pipeline stops + error event emitted ─────────────

  it("ESTIMATE failure: emits ESTIMATE:error and no further stages run", async () => {
    target.simulate.mockRejectedValue(new Error("rpc down"));
    const events: PipelineProgressEvent[] = [];
    const result = await run({ options: { onProgress: (e) => events.push(e) } });

    expect(result.ok).toBe(false);
    expect(events.some((e) => e.stage === "ESTIMATE" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("SIGN");
    expect(stages).not.toContain("SUBMIT");
    expect(stages).not.toContain("POLL");
    expect(target.sign).not.toHaveBeenCalled();
  });

  it("SIGN failure: emits SIGN:error and no further stages run", async () => {
    target.sign.mockRejectedValue(
      new TikkaSdkError(TikkaSdkErrorCode.UserRejected, "User rejected the request"),
    );
    const events: PipelineProgressEvent[] = [];
    const result = await run({ options: { onProgress: (e) => events.push(e) } });

    expect(result.ok).toBe(false);
    expect(events.some((e) => e.stage === "SIGN" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("SUBMIT");
    expect(stages).not.toContain("POLL");
    expect(target.submit).not.toHaveBeenCalled();
  });

  it("SUBMIT failure: emits SUBMIT:error and no further stages run", async () => {
    target.submit.mockRejectedValue(new Error("bad seq"));
    const events: PipelineProgressEvent[] = [];
    const result = await run({ options: { onProgress: (e) => events.push(e) } });

    expect(result.ok).toBe(false);
    expect(events.some((e) => e.stage === "SUBMIT" && e.status === "error")).toBe(true);
    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("POLL");
    expect(stages).not.toContain("DONE");
    expect(target.poll).not.toHaveBeenCalled();
  });

  it("POLL failure: emits POLL:error and DONE is not emitted", async () => {
    target.poll.mockRejectedValue(new Error("failed"));
    const events: PipelineProgressEvent[] = [];
    const result = await run({ options: { onProgress: (e) => events.push(e) } });

    expect(result.ok).toBe(false);
    expect(events.some((e) => e.stage === "POLL" && e.status === "error")).toBe(true);
    expect(events.some((e) => e.stage === "DONE")).toBe(false);
  });

  // ── Progress event payloads ─────────────────────────────────────────────────

  it("onProgress is optional — pipeline succeeds without it", async () => {
    const result = await run();

    expect(result.ok).toBe(true);
  });

  it("POLL:done carries confirmations: 1", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

    const e = events.find((e) => e.stage === "POLL" && e.status === "done")!;
    if (e.stage === "POLL" && e.status === "done") {
      expect(e.confirmations).toBe(1);
    }
  });

  it("DONE:done carries the txHash reported by the SDK poll", async () => {
    target.submit.mockResolvedValue("SUBHASH");
    target.poll.mockResolvedValue(successPoll({ txHash: "POLLHASH" }) as never);

    const events: PipelineProgressEvent[] = [];
    const result = await run({ options: { onProgress: (e) => events.push(e) } });

    const done = events.find((e) => e.stage === "DONE")!;
    if (done.stage === "DONE") {
      expect(done.txHash).toBe("POLLHASH");
    }
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.txHash).toBe("POLLHASH");
  });

  it("BUILD emits pending + done without invoking any SDK call", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

    const buildIdx = events.findIndex((e) => e.stage === "BUILD");
    expect(events[buildIdx]).toEqual({ stage: "BUILD", status: "pending" });
    expect(events[buildIdx + 1]).toEqual({ stage: "BUILD", status: "done" });
    // simulate runs after the no-op BUILD stage
    expect(target.simulate).toHaveBeenCalled();
  });

  it("each stage emits pending before done", async () => {
    const events: PipelineProgressEvent[] = [];
    await run({ options: { onProgress: (e) => events.push(e) } });

    for (const stage of ["BUILD", "ESTIMATE", "SIGN", "SUBMIT", "POLL"] as const) {
      const pendingIdx = events.findIndex((e) => e.stage === stage && e.status === "pending");
      const doneIdx = events.findIndex((e) => e.stage === stage && e.status === "done");
      expect(pendingIdx).toBeGreaterThanOrEqual(0);
      expect(doneIdx).toBeGreaterThan(pendingIdx);
    }
  });

  // ── Safety net ──────────────────────────────────────────────────────────────

  it("never throws — always returns a result union", async () => {
    target.simulate.mockRejectedValue(new Error("catastrophic"));

    await expect(run()).resolves.toBeDefined();
  });

  // ── sdkErrorToPipelineError standalone mapping ───────────────────────────────

  it("maps SDK errors outside the pipeline (single entry-point callers)", () => {
    expect(sdkErrorToPipelineError(
      new TikkaSdkError(TikkaSdkErrorCode.UserRejected, "no"),
    ).code).toBe("USER_REJECTED");

    expect(sdkErrorToPipelineError(
      new TikkaSdkError(TikkaSdkErrorCode.WalletNotConnected, "no"),
    ).code).toBe("SIGNING_FAILED");

    expect(sdkErrorToPipelineError(
      new TikkaSdkError(TikkaSdkErrorCode.Timeout, "no"),
      { txHash: "H1" },
    ).code).toBe("TIMEOUT");

    expect(sdkErrorToPipelineError(new Error("Insufficient balance")).code).toBe("INSUFFICIENT_FEES");

    expect(sdkErrorToPipelineError(new Error("boom")).code).toBe("SUBMISSION_FAILED");
  });
});