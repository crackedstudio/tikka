import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWallet, normalizeNetworkName } from "./useWallet";
import * as walletSdk from "../../../sdk/src/wallet";
import { useAuthStore } from "../store/useAuthStore";

vi.mock("../../../sdk/src/wallet", () => ({
  getWalletAdapter: vi.fn(),
}));

vi.mock("../store/useAuthStore", () => ({
  useAuthStore: () => ({
    address: null,
    network: null,
    setAddress: vi.fn(),
    setNetwork: vi.fn(),
    setConnected: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

describe("useWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects using the SDK adapter", async () => {
    const adapter = {
      id: "mock",
      connect: vi.fn().mockResolvedValue({ address: "GABCDEF", network: "testnet" }),
      disconnect: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
    };
    vi.mocked(walletSdk.getWalletAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof walletSdk.getWalletAdapter>);
    
    const { result } = renderHook(() => useWallet());
    
    await act(async () => {
      await result.current.connect("mock");
    });
    
    expect(walletSdk.getWalletAdapter).toHaveBeenCalledWith("mock");
    expect(adapter.connect).toHaveBeenCalledOnce();
    expect(result.current.isConnected).toBe(true);
    expect(result.current.address).toBe("GABCDEF");
    expect(result.current.network).toBe("testnet");
  });

  it("disconnects and clears state", async () => {
    const adapter = {
      id: "mock",
      connect: vi.fn().mockResolvedValue({ address: "GABCDEF", network: "testnet" }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      signTransaction: vi.fn(),
    };
    vi.mocked(walletSdk.getWalletAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof walletSdk.getWalletAdapter>);
    
    const { result } = renderHook(() => useWallet());
    
    await act(async () => {
      await result.current.connect("mock");
    });
    await act(async () => {
      await result.current.disconnect();
    });
    
    expect(adapter.disconnect).toHaveBeenCalledOnce();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBe(null);
    expect(result.current.network).toBe(null);
  });

  it("signs a transaction with the selected adapter and network passphrase", async () => {
    const adapter = {
      id: "mock",
      connect: vi.fn().mockResolvedValue({ address: "GABCDEF", network: "testnet" }),
      disconnect: vi.fn(),
      signTransaction: vi.fn().mockResolvedValue("signed-xdr"),
    };
    vi.mocked(walletSdk.getWalletAdapter).mockReturnValue(adapter as unknown as ReturnType<typeof walletSdk.getWalletAdapter>);
    
    const { result } = renderHook(() => useWallet());
    
    await act(async () => {
      await result.current.connect("mock");
    });
    
    let signed: string = "";
    await act(async () => {
      signed = await result.current.signTransaction("xdr-to-sign");
    });
    
    expect(adapter.signTransaction).toHaveBeenCalledWith("xdr-to-sign", {
      networkPassphrase: "Test SDF Network ; September 2015",
      address: "GABCDEF",
    });
    expect(signed).toBe("signed-xdr");
  });

  it("normalizes network names", () => {
    expect(normalizeNetworkName("Testnet")).toBe("testnet");
    expect(normalizeNetworkName("Public Global Stellar Network ; September 2015")).toBe("public");
    expect(normalizeNetworkName("Future Net")).toBe("futurenet");
  });
});
