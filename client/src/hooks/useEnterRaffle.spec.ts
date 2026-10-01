import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEnterRaffle } from "./useEnterRaffle";

const mockUseWalletContext = vi.fn();
vi.mock("../providers", () => ({
  useWalletContext: () => mockUseWalletContext(),
}));

const mockMutateAsync = vi.fn();
vi.mock("./useRaffleMutations", () => ({
  useBuyTicketsMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const baseParams = {
  raffleId: 1,
  ticketPrice: "1000000",
  ticketCount: 1,
};

describe("useEnterRaffle", () => {
  const connect = vi.fn();
  const switchNetwork = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWalletContext.mockReturnValue({
      isConnected: true,
      isWrongNetwork: false,
      connect,
      switchNetwork,
    });
  });

  it("prompts wallet connection when not connected", async () => {
    mockUseWalletContext.mockReturnValue({
      isConnected: false,
      isWrongNetwork: false,
      connect,
      switchNetwork,
    });
    const { result } = renderHook(() => useEnterRaffle(baseParams));

    await act(async () => result.current.handleButtonClick());

    expect(connect).toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("prompts a network switch on the wrong network", async () => {
    mockUseWalletContext.mockReturnValue({
      isConnected: true,
      isWrongNetwork: true,
      connect,
      switchNetwork,
    });
    const { result } = renderHook(() => useEnterRaffle(baseParams));

    await act(async () => result.current.handleButtonClick());

    expect(switchNetwork).toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces a friendly message when the user rejects signing", async () => {
    mockMutateAsync.mockResolvedValue({
      ok: false,
      error: { code: "USER_REJECTED", message: "rejected" },
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useEnterRaffle({ ...baseParams, onError }));
    await act(async () => result.current.handleButtonClick());

    expect(onError).toHaveBeenCalledWith("Transaction was cancelled.");
    expect(result.current.showFailedModal).toBe(true);
  });

  it("surfaces an error when submission fails", async () => {
    mockMutateAsync.mockResolvedValue({
      ok: false,
      error: { code: "SUBMISSION_FAILED", message: "network error" },
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useEnterRaffle({ ...baseParams, onError }));
    await act(async () => result.current.handleButtonClick());

    expect(onError).toHaveBeenCalledWith("Failed to submit transaction.");
  });

  it("reports success and shows the success modal", async () => {
    mockMutateAsync.mockResolvedValue({ ok: true, data: { txHash: "0xabc" } });
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useEnterRaffle({ ...baseParams, onSuccess }));
    await act(async () => result.current.handleButtonClick());

    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.showSuccessModal).toBe(true);
  });
});