import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCreateRaffle } from "./useCreateRaffle";
import { createRaffle } from "../services/sdkClient";
import { MetadataService } from "../services/metadataService";

vi.mock("../services/sdkClient", () => ({
  createRaffle: vi.fn(),
}));

vi.mock("../services/metadataService", () => ({
  MetadataService: { uploadMetadataWithImage: vi.fn() },
}));

const mockUseWalletContext = vi.fn();
const mockUseAuthContext = vi.fn();
vi.mock("../providers", () => ({
  useWalletContext: () => mockUseWalletContext(),
  useAuthContext: () => mockUseAuthContext(),
}));

const mockedCreateRaffle = vi.mocked(createRaffle);
const mockedUploadMetadataWithImage = vi.mocked(MetadataService.uploadMetadataWithImage);

const baseParams = {
  title: "t",
  description: "d",
  prizeName: "p",
  prizeValue: "1",
  prizeCurrency: "USD",
  category: "c",
  tags: [],
  endTime: Math.floor(Date.now() / 1000) + 3600,
  maxTickets: 10,
  ticketPrice: "1000000",
  imageFile: new File([], "img.png"),
};

describe("useCreateRaffle", () => {
  const connect = vi.fn();
  const switchNetwork = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockUseWalletContext.mockReturnValue({ isConnected: true, isWrongNetwork: false, connect, switchNetwork });
    mockUseAuthContext.mockReturnValue({ isAuthenticated: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prompts wallet connection when not connected", async () => {
    mockUseWalletContext.mockReturnValue({ isConnected: false, isWrongNetwork: false, connect, switchNetwork });
    const { result } = renderHook(() => useCreateRaffle(baseParams));

    await act(async () => result.current.handleButtonClick());

    expect(connect).toHaveBeenCalled();
    expect(mockedUploadMetadataWithImage).not.toHaveBeenCalled();
  });

  it("prompts a network switch on the wrong network", async () => {
    mockUseWalletContext.mockReturnValue({ isConnected: true, isWrongNetwork: true, connect, switchNetwork });
    const { result } = renderHook(() => useCreateRaffle(baseParams));

    await act(async () => result.current.handleButtonClick());

    expect(switchNetwork).toHaveBeenCalled();
  });

  it("surfaces a friendly message when the user rejects signing", async () => {
    mockedUploadMetadataWithImage.mockResolvedValue("cid123");
    mockedCreateRaffle.mockResolvedValue({
      ok: false,
      error: { code: "USER_REJECTED", message: "rejected" },
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useCreateRaffle({ ...baseParams, onError }));
    await act(async () => result.current.handleButtonClick());
    await act(async () => vi.runAllTimersAsync());

    expect(onError).toHaveBeenCalledWith("Transaction was cancelled.");
  });

  it("surfaces an error when submission fails", async () => {
    mockedUploadMetadataWithImage.mockResolvedValue("cid123");
    mockedCreateRaffle.mockResolvedValue({
      ok: false,
      error: { code: "SUBMISSION_FAILED", message: "network error" },
    });
    const onError = vi.fn();

    const { result } = renderHook(() => useCreateRaffle({ ...baseParams, onError }));
    await act(async () => result.current.handleButtonClick());
    await act(async () => vi.runAllTimersAsync());

    expect(onError).toHaveBeenCalledWith("network error");
  });

  it("reports success and stores the tx hash", async () => {
    mockedUploadMetadataWithImage.mockResolvedValue("cid123");
    mockedCreateRaffle.mockResolvedValue({ ok: true, data: { txHash: "0xabc" } });
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useCreateRaffle({ ...baseParams, onSuccess }));
    await act(async () => result.current.handleButtonClick());
    await act(async () => vi.runAllTimersAsync());

    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.txHash).toBe("0xabc");
  });
});