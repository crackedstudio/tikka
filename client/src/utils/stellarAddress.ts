/**
 * Stellar account-address (strkey) validation.
 *
 * The `CreatorProfile` route takes its address straight from the URL (#1541),
 * so the param has to be checked before it is handed to the API. This is
 * implemented here rather than by importing `StrKey` from
 * `@stellar/stellar-sdk`: the client does not otherwise use that package at
 * runtime, and pulling it in for a single route guard would work against the
 * bundle-size budgets tracked in #1556.
 *
 * The encoding is the documented strkey format: a version byte, the 32-byte
 * ed25519 key, and a CRC16-XModem checksum, base32-encoded (RFC 4648, no
 * padding). The behaviour is the same as `StrKey.isValidEd25519PublicKey`.
 */

/** RFC 4648 base32 alphabet, as used by strkey (no padding). */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Version byte for an ed25519 public key (`6 << 3`), rendered as a leading `G`. */
const ED25519_PUBLIC_KEY_VERSION_BYTE = 6 << 3;

/** An encoded ed25519 public key is 35 bytes, i.e. 56 characters. */
const ED25519_PUBLIC_KEY_LENGTH = 56;

/** Version byte + 32-byte key, before the 2 checksum bytes. */
const CHECKSUM_PAYLOAD_LENGTH = 33;

/** Decoded length of an ed25519 public key strkey: 33 payload + 2 checksum bytes. */
const DECODED_LENGTH = 35;

function base32Decode(input: string): Uint8Array | null {
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const char of input) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) return null;

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
            // Drop the bits already emitted so `value` never holds more than
            // 13 bits; without this the shifts above overflow 32-bit maths.
            value &= (1 << bits) - 1;
        }
    }

    return Uint8Array.from(bytes);
}

function crc16Xmodem(bytes: Uint8Array): number {
    let crc = 0x0000;
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc;
}

/**
 * True when `address` is a syntactically valid Stellar ed25519 account
 * address: correct length and version byte, valid base32, and a checksum that
 * matches the payload.
 *
 * This validates the address itself, not whether an account exists on-chain —
 * a well-formed address for an unused account still passes.
 */
export function isValidStellarAddress(address: string | null | undefined): address is string {
    if (!address || address.length !== ED25519_PUBLIC_KEY_LENGTH || address[0] !== "G") {
        return false;
    }
    if (!/^[A-Z2-7]+$/.test(address)) return false;

    const decoded = base32Decode(address);
    if (!decoded || decoded.length !== DECODED_LENGTH) return false;
    if (decoded[0] !== ED25519_PUBLIC_KEY_VERSION_BYTE) return false;

    const payload = decoded.subarray(0, CHECKSUM_PAYLOAD_LENGTH);
    // The checksum is appended little-endian: low byte first.
    const checksum = decoded[CHECKSUM_PAYLOAD_LENGTH] | (decoded[CHECKSUM_PAYLOAD_LENGTH + 1] << 8);

    return crc16Xmodem(payload) === checksum;
}
