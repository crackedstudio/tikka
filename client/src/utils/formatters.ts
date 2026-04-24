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
