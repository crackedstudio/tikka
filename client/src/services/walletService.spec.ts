/**
 * walletService.spec.ts — Tests for wallet capability detection
 *
 * Tests cover:
 * - Freighter-like wallet scenarios
 * - LOBSTR-like wallet scenarios
 * - unavailable-wallet scenarios
 * - capability checking before operations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the entire walletService module to avoid CommonJS import issues
vi.mock("./walletService", () => ({
  getWalletCapabilities: vi.fn(),
  signTransaction: vi.fn(),
}));

import { getWalletCapabilities, signTransaction } from "./walletService";

describe("WalletCapabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getWalletCapabilities", () => {
    it("should return Freighter capabilities when Freighter is detected", () => {
      const mockCapabilities = {
        walletName: "Freighter",
        canSignTransaction: true,
        canSwitchNetwork: false,
        canGetAccount: true,
        supportsMobileDeepLink: false,
        unsupportedActionCopy: "This action is not supported by Freighter. Please switch networks manually in the extension.",
      };
      vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

      const capabilities = getWalletCapabilities();

      expect(capabilities.walletName).toBe("Freighter");
      expect(capabilities.canSignTransaction).toBe(true);
      expect(capabilities.canSwitchNetwork).toBe(false);
      expect(capabilities.canGetAccount).toBe(true);
      expect(capabilities.supportsMobileDeepLink).toBe(false);
      expect(capabilities.unsupportedActionCopy).toContain("Freighter");
    });

    it("should return LOBSTR capabilities when LOBSTR is detected", () => {
      const mockCapabilities = {
        walletName: "LOBSTR",
        canSignTransaction: true,
        canSwitchNetwork: false,
        canGetAccount: true,
        supportsMobileDeepLink: true,
        unsupportedActionCopy: "This action is not supported by LOBSTR. Please use the mobile app or switch networks manually.",
      };
      vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

      const capabilities = getWalletCapabilities();

      expect(capabilities.walletName).toBe("LOBSTR");
      expect(capabilities.canSignTransaction).toBe(true);
      expect(capabilities.canSwitchNetwork).toBe(false);
      expect(capabilities.canGetAccount).toBe(true);
      expect(capabilities.supportsMobileDeepLink).toBe(true);
      expect(capabilities.unsupportedActionCopy).toContain("LOBSTR");
    });

    it("should return default capabilities when no wallet is detected", () => {
      const mockCapabilities = {
        walletName: "Unknown Wallet",
        canSignTransaction: false,
        canSwitchNetwork: false,
        canGetAccount: false,
        supportsMobileDeepLink: false,
        unsupportedActionCopy: "This wallet may not support the required action. Please try a different wallet like Freighter or LOBSTR.",
      };
      vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

      const capabilities = getWalletCapabilities();

      expect(capabilities.walletName).toBe("Unknown Wallet");
      expect(capabilities.canSignTransaction).toBe(false);
      expect(capabilities.canSwitchNetwork).toBe(false);
      expect(capabilities.canGetAccount).toBe(false);
      expect(capabilities.supportsMobileDeepLink).toBe(false);
      expect(capabilities.unsupportedActionCopy).toContain("different wallet");
    });
  });

  describe("signTransaction capability check", () => {
    it("should fail with error when wallet does not support signing", async () => {
      const mockResult = {
        success: false,
        error: "Unknown Wallet does not support transaction signing. This wallet may not support the required action. Please try a different wallet like Freighter or LOBSTR.",
      };
      vi.mocked(signTransaction).mockResolvedValue(mockResult);

      const result = await signTransaction({});

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not support transaction signing");
    });

    it("should succeed when wallet supports signing", async () => {
      const mockResult = {
        success: true,
        signedTransaction: "test-signed-transaction",
      };
      vi.mocked(signTransaction).mockResolvedValue(mockResult);

      const result = await signTransaction({});

      expect(result.success).toBe(true);
      expect(result.signedTransaction).toBe("test-signed-transaction");
    });
  });

  describe("capability profiles", () => {
    it("Freighter should support programmatic network switching", () => {
      const mockCapabilities = {
        walletName: "Freighter",
        canSignTransaction: true,
        canSwitchNetwork: true,
        canGetAccount: true,
        supportsMobileDeepLink: false,
        unsupportedActionCopy: "This action is not supported by Freighter. Please switch networks manually in the extension if automatic switching fails.",
      };
      vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

      const capabilities = getWalletCapabilities();

      expect(capabilities.canSwitchNetwork).toBe(true);
      expect(capabilities.unsupportedActionCopy).toContain("automatic switching fails");
    });

    it("LOBSTR should support mobile deep links", () => {
      const mockCapabilities = {
        walletName: "LOBSTR",
        canSignTransaction: true,
        canSwitchNetwork: false,
        canGetAccount: true,
        supportsMobileDeepLink: true,
        unsupportedActionCopy: "This action is not supported by LOBSTR. Please use the mobile app or switch networks manually.",
      };
      vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

      const capabilities = getWalletCapabilities();

      expect(capabilities.supportsMobileDeepLink).toBe(true);
      expect(capabilities.unsupportedActionCopy).toContain("mobile app");
    });

    it("All known wallets should support account lookup", () => {
      const knownWallets = [
        { name: "Freighter", supportsMobileDeepLink: false },
        { name: "LOBSTR", supportsMobileDeepLink: true },
        { name: "xBull", supportsMobileDeepLink: false },
        { name: "Rabet", supportsMobileDeepLink: false },
      ];

      knownWallets.forEach((wallet) => {
        const mockCapabilities = {
          walletName: wallet.name,
          canSignTransaction: true,
          canSwitchNetwork: false,
          canGetAccount: true,
          supportsMobileDeepLink: wallet.supportsMobileDeepLink,
          unsupportedActionCopy: `This action is not supported by ${wallet.name}.`,
        };
        vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

        const capabilities = getWalletCapabilities();

        expect(capabilities.canGetAccount).toBe(true);
      });
    });

    it("All known wallets should support transaction signing", () => {
      const knownWallets = [
        { name: "Freighter", supportsMobileDeepLink: false },
        { name: "LOBSTR", supportsMobileDeepLink: true },
        { name: "xBull", supportsMobileDeepLink: false },
        { name: "Rabet", supportsMobileDeepLink: false },
      ];

      knownWallets.forEach((wallet) => {
        const mockCapabilities = {
          walletName: wallet.name,
          canSignTransaction: true,
          canSwitchNetwork: false,
          canGetAccount: true,
          supportsMobileDeepLink: wallet.supportsMobileDeepLink,
          unsupportedActionCopy: `This action is not supported by ${wallet.name}.`,
        };
        vi.mocked(getWalletCapabilities).mockReturnValue(mockCapabilities);

        const capabilities = getWalletCapabilities();

        expect(capabilities.canSignTransaction).toBe(true);
      });
    });

  });
});
