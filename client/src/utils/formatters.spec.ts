import { describe, it, expect } from "vitest";
import { formatXlm, formatAmount, formatTotal, formatPrice, formatDate, shortenAddress } from "./formatters";

describe("Amount Formatting - XLM/Tokens", () => {
    describe("formatXlm", () => {
        it("formats zero stroops", () => {
            expect(formatXlm("0")).toBe("0.0000000");
            expect(formatXlm(0n)).toBe("0.0000000");
        });

        it("formats one stroop (smallest unit)", () => {
            expect(formatXlm("1")).toBe("0.0000001");
        });

        it("formats exactly one XLM", () => {
            expect(formatXlm("10000000")).toBe("1.0000000");
            expect(formatXlm(10_000_000n)).toBe("1.0000000");
        });

        it("formats fractional XLM without floating-point rounding", () => {
            expect(formatXlm("10000001")).toBe("1.0000001");
            expect(formatXlm("1234567")).toBe("0.1234567");
        });

        it("formats large stroop balances exactly", () => {
            const large = "12345678901234567890000000";
            expect(formatXlm(large)).toBe("1234567890123456789.0000000");
        });

        it("formats bigint stroops without precision loss", () => {
            const stroops = 18446744073709551615n;
            expect(formatXlm(stroops)).toBe("1844674407370.9551615");
        });

        it("treats invalid stroop strings as zero", () => {
            expect(formatXlm("")).toBe("0.0000000");
            expect(formatXlm("   ")).toBe("0.0000000");
            expect(formatXlm("12.34")).toBe("0.0000000");
        });

        it("formats negative stroops when present", () => {
            expect(formatXlm("-1")).toBe("-0.0000001");
            expect(formatXlm(-10_000_000n)).toBe("-1.0000000");
        });
    });

    describe("formatAmount", () => {
        it("formats zero with asset symbol", () => {
            expect(formatAmount("0")).toBe("0.0000000 XLM");
            expect(formatAmount(0n)).toBe("0.0000000 XLM");
        });

        it("formats amounts with custom asset", () => {
            expect(formatAmount("10000000", "USDC")).toBe("1.0000000 USDC");
            expect(formatAmount("5000000", "ETH")).toBe("0.5000000 ETH");
        });

        it("handles tiny amounts", () => {
            expect(formatAmount("1", "XLM")).toBe("0.0000001 XLM");
        });

        it("handles large amounts", () => {
            expect(formatAmount("1234567890000000", "XLM")).toBe("123456.7890000 XLM");
        });

        it("handles invalid input as zero", () => {
            expect(formatAmount("invalid", "XLM")).toBe("0.0000000 XLM");
        });
    });

    describe("formatTotal", () => {
        it("formats pre-calculated totals", () => {
            // Must be pre-summed to avoid float math
            const total = "25000000"; // 2.5 XLM pre-summed
            expect(formatTotal(total, "XLM")).toBe("2.5000000 XLM");
        });

        it("handles zero total", () => {
            expect(formatTotal("0", "XLM")).toBe("0.0000000 XLM");
        });
    });

    describe("formatPrice", () => {
        it("formats ticket prices with 7 decimals", () => {
            expect(formatPrice("1500000", 7, "XLM")).toBe("0.1500000 XLM");
        });

        it("formats prices with custom decimal places", () => {
            expect(formatPrice("1500000", 3, "XLM")).toBe("0.150 XLM");
            expect(formatPrice("1500000", 2, "XLM")).toBe("0.15 XLM");
        });

        it("handles zero price", () => {
            expect(formatPrice("0", 3, "XLM")).toBe("0.000 XLM");
        });

        it("handles large prices", () => {
            expect(formatPrice("50000000", 7, "XLM")).toBe("5.0000000 XLM");
        });

        it("handles tiny prices (less than 1 stroop display)", () => {
            expect(formatPrice("1", 7, "XLM")).toBe("0.0000001 XLM");
        });

        it("formats prices with custom asset", () => {
            expect(formatPrice("10000000", 7, "USDC")).toBe("1.0000000 USDC");
        });
    });
});

describe("formatDate", () => {
    const fixedUtc = "2024-06-15T14:30:00.000Z";

    it("formats the same instant differently per locale", () => {
        const en = formatDate(fixedUtc, "en-US");
        const de = formatDate(fixedUtc, "de-DE");
        const ja = formatDate(fixedUtc, "ja-JP");

        expect(en.length).toBeGreaterThan(0);
        expect(de.length).toBeGreaterThan(0);
        expect(ja.length).toBeGreaterThan(0);
        expect(new Set([en, de, ja]).size).toBeGreaterThanOrEqual(2);
    });

    it("accepts a Date instance", () => {
        const d = new Date(fixedUtc);
        expect(formatDate(d, "en-US")).toBe(formatDate(fixedUtc, "en-US"));
    });

    it("returns empty string for invalid dates", () => {
        expect(formatDate("not-a-date", "en-US")).toBe("");
    });
});

describe("shortenAddress", () => {
    it("returns G...last4 for a long Stellar-style address", () => {
        const addr = "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890WXYZ";
        expect(shortenAddress(addr)).toBe("G...WXYZ");
    });

    it("returns the original string when too short to shorten", () => {
        expect(shortenAddress("G12345")).toBe("G12345");
        expect(shortenAddress("G1234567")).toBe("G1234567");
    });

    it("returns empty for empty input", () => {
        expect(shortenAddress("")).toBe("");
    });
});
