import { describe, it, expect } from "vitest";
import { formatXlm, formatDate, shortenAddress } from "./formatters";

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
        // 1 stroop past 1 XLM — must not become 1.000000099999… in string form
        expect(formatXlm("10000001")).toBe("1.0000001");
        expect(formatXlm("1234567")).toBe("0.1234567");
    });

    it("formats large stroop balances exactly", () => {
        const large = "12345678901234567890000000"; // 12_345_678_901_234_567_890 * 10^7 stroops
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

describe("formatDate", () => {
    const fixedUtc = "2024-06-15T14:30:00.000Z";

    it("formats the same instant differently per locale", () => {
        const en = formatDate(fixedUtc, "en-US");
        const de = formatDate(fixedUtc, "de-DE");
        const ja = formatDate(fixedUtc, "ja-JP");

        expect(en.length).toBeGreaterThan(0);
        expect(de.length).toBeGreaterThan(0);
        expect(ja.length).toBeGreaterThan(0);
        // ICU data can vary; require distinct formatting across common locales
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
