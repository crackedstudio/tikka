/** Stellar: 1 XLM = 10_000_000 stroops — integer math only (no float drift). */
const STROOPS_PER_XLM = 10_000_000n;

function parseStroops(stroops: string | bigint): bigint {
    if (typeof stroops === "bigint") return stroops;
    const t = stroops.trim();
    if (!t || !/^-?\d+$/.test(t)) return 0n;
    return BigInt(t);
}

/**
 * Converts stroops (string or bigint from API / contract) to a fixed 7-decimal XLM string.
 */
export function formatXlm(stroops: string | bigint): string {
    const n = parseStroops(stroops);
    const negative = n < 0n;
    const abs = negative ? -n : n;
    const whole = abs / STROOPS_PER_XLM;
    const frac = abs % STROOPS_PER_XLM;
    const fracStr = frac.toString().padStart(7, "0");
    const out = `${whole.toString()}.${fracStr}`;
    return negative ? `-${out}` : out;
}

/**
 * Format amount with asset symbol. Handles zero, tiny, large, and invalid values.
 * @param stroops - Amount in stroops (string or bigint)
 * @param asset - Asset symbol (default: XLM)
 * @returns Formatted string like "10.123456 XLM"
 */
export function formatAmount(stroops: string | bigint, asset = "XLM"): string {
    if (!stroops) return `0.0000000 ${asset}`;
    const xlm = formatXlm(stroops);
    return `${xlm} ${asset}`;
}

/**
 * Format total with multiple amounts (no floating-point math). Sum must be pre-calculated.
 * @param stroops - Pre-summed total in stroops
 * @param asset - Asset symbol
 * @returns Formatted string
 */
export function formatTotal(stroops: string | bigint, asset = "XLM"): string {
    return formatAmount(stroops, asset);
}

/**
 * Format price display for tickets/fees. Avoids floating-point by using stroops directly.
 * @param stroops - Price in stroops
 * @param displayDecimals - How many decimals to show (default: 7)
 * @param asset - Asset symbol
 * @returns Formatted price like "1.500000 XLM"
 */
export function formatPrice(stroops: string | bigint, displayDecimals = 7, asset = "XLM"): string {
    const n = parseStroops(stroops);
    if (n === 0n) return `0.${"0".repeat(displayDecimals)} ${asset}`;
    
    const negative = n < 0n;
    const abs = negative ? -n : n;
    const whole = abs / STROOPS_PER_XLM;
    const frac = abs % STROOPS_PER_XLM;
    const fracStr = frac.toString().padStart(7, "0").slice(0, displayDecimals);
    const out = `${whole.toString()}.${fracStr}`;
    return negative ? `-${out} ${asset}` : `${out} ${asset}`;
}

/**
 * Formats an ISO timestamp (or Date) for display in the given BCP 47 locale.
 */
export function formatDate(isoOrDate: string | Date, locale: string): string {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(d);
}

/** Stellar-style account address: first character, ellipsis, last four (e.g. G...ABCD). */
export function shortenAddress(address: string): string {
    if (!address) return "";
    if (address.length <= 8) return address;
    return `${address.slice(0, 1)}...${address.slice(-4)}`;
}
