import { createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_SECRET_ENV,
  WEBHOOK_SOURCE,
  WEBHOOK_SOURCE_HEADER,
  buildWebhookHeaders,
  resolveWebhookSignatureSecret,
  signWebhookBody,
} from "./webhook-signature";

/**
 * The two ends of the webhook signature contract.
 *
 * The outbound half is `webhook-signature.ts`; the inbound half is the
 * backend's `WebhookSignatureVerificationInterceptor`. The last block here
 * reads that interceptor from disk and fails if it no longer agrees with the
 * constants below — the point being that a signature only this side knows how
 * to produce is a 401 for every subscriber.
 */

const SECRET = "test-secret";
const RAW_BODY = JSON.stringify({
  eventType: "RaffleCreated",
  data: { raffleId: 7 },
});

/**
 * A faithful stand-in for the interceptor's verification, written the way the
 * interceptor does it: HMAC-SHA256 hex over the raw body, compared to the
 * provided hex with `timingSafeEqual` (which requires equal lengths).
 */
function interceptorAccepts(
  rawBody: string,
  signatureHex: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(Buffer.from(rawBody))
    .digest("hex");

  const providedBuf = Buffer.from(signatureHex, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  return (
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf)
  );
}

describe("signWebhookBody", () => {
  it("matches a known HMAC-SHA256 vector", () => {
    // A pinned value, not a re-computation: if the algorithm, digest encoding,
    // or body handling changes, this is what catches it.
    expect(signWebhookBody(SECRET, RAW_BODY)).toBe(
      "aa646cb729b56488a3e16a44ea6a5465ad87a1f0483cbe3b9e82ae45581b0277",
    );
  });

  it("signs a string and its UTF-8 buffer identically", () => {
    expect(signWebhookBody(SECRET, RAW_BODY)).toBe(
      signWebhookBody(SECRET, Buffer.from(RAW_BODY, "utf8")),
    );
  });

  it("produces a 64-character lowercase hex digest", () => {
    expect(signWebhookBody(SECRET, RAW_BODY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the body changes", () => {
    // The reason the caller must sign the bytes it actually sends.
    const tampered = RAW_BODY.replace("7", "8");
    expect(signWebhookBody(SECRET, tampered)).not.toBe(
      signWebhookBody(SECRET, RAW_BODY),
    );
  });

  it("changes when the secret changes", () => {
    expect(signWebhookBody("other-secret", RAW_BODY)).not.toBe(
      signWebhookBody(SECRET, RAW_BODY),
    );
  });

  it("is accepted by a verification written like the interceptor's", () => {
    // Sign and verify in one test: the two sides cannot drift silently.
    const signature = signWebhookBody(SECRET, RAW_BODY);

    expect(interceptorAccepts(RAW_BODY, signature, SECRET)).toBe(true);
    expect(interceptorAccepts(RAW_BODY, signature, "wrong-secret")).toBe(false);
    expect(
      interceptorAccepts(RAW_BODY.replace("7", "8"), signature, SECRET),
    ).toBe(false);
    expect(interceptorAccepts(RAW_BODY, "deadbeef", SECRET)).toBe(false);
  });
});

describe("resolveWebhookSignatureSecret", () => {
  it("returns the configured secret", () => {
    expect(
      resolveWebhookSignatureSecret({ [WEBHOOK_SIGNATURE_SECRET_ENV]: SECRET }),
    ).toBe(SECRET);
  });

  it("returns undefined when unset or empty", () => {
    // An empty secret still produces a signature that looks valid, so it is
    // reported as absent rather than passed through.
    expect(resolveWebhookSignatureSecret({})).toBeUndefined();
    expect(
      resolveWebhookSignatureSecret({ [WEBHOOK_SIGNATURE_SECRET_ENV]: "" }),
    ).toBeUndefined();
  });
});

describe("buildWebhookHeaders", () => {
  const deliveryId = "delivery-1";

  it("signs the exact body it is given", () => {
    const headers = buildWebhookHeaders({
      secret: SECRET,
      rawBody: RAW_BODY,
      deliveryId,
    });

    expect(headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
      signWebhookBody(SECRET, RAW_BODY),
    );
    expect(
      interceptorAccepts(RAW_BODY, headers[WEBHOOK_SIGNATURE_HEADER], SECRET),
    ).toBe(true);
  });

  it("sends the content type, source, and delivery id", () => {
    const headers = buildWebhookHeaders({
      secret: SECRET,
      rawBody: RAW_BODY,
      deliveryId,
    });

    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers[WEBHOOK_SOURCE_HEADER]).toBe(WEBHOOK_SOURCE);
    expect(headers[WEBHOOK_DELIVERY_ID_HEADER]).toBe(deliveryId);
  });

  it("omits the signature entirely when there is no secret", () => {
    const headers = buildWebhookHeaders({ rawBody: RAW_BODY, deliveryId });

    expect(headers).not.toHaveProperty(WEBHOOK_SIGNATURE_HEADER);
    // The delivery id is still sent: it is useful to subscribers either way.
    expect(headers[WEBHOOK_DELIVERY_ID_HEADER]).toBe(deliveryId);
  });

  it("does not sign with an empty secret", () => {
    const headers = buildWebhookHeaders({
      secret: "",
      rawBody: RAW_BODY,
      deliveryId,
    });

    expect(headers).not.toHaveProperty(WEBHOOK_SIGNATURE_HEADER);
  });
});

/**
 * Anti-drift guard.
 *
 * Everything above proves this side is self-consistent; this block proves it
 * still agrees with the side that verifies. The interceptor lives in the
 * backend package of this monorepo, so its source is right there to read.
 */
describe("backend interceptor contract", () => {
  const interceptorPath = resolve(
    __dirname,
    "../../../backend/src/api/rest/webhooks/webhook-signature-verification.interceptor.ts",
  );

  let source: string;

  beforeAll(() => {
    if (!existsSync(interceptorPath)) {
      throw new Error(
        `Cannot check the webhook signature contract: ${interceptorPath} was not found. ` +
          `If the interceptor moved, update this path; do not delete this check.`,
      );
    }
    source = readFileSync(interceptorPath, "utf8");
  });

  it("reads the signature from the header we write", () => {
    const declared = source.match(
      /SIGNATURE_HEADER\s*=\s*['"]([^'"]+)['"]/,
    )?.[1];

    expect(declared).toBe(WEBHOOK_SIGNATURE_HEADER);
  });

  it("verifies HMAC-SHA256 with a hex digest", () => {
    expect(source).toMatch(/createHmac\(\s*['"]sha256['"]/);
    expect(source).toMatch(/\.digest\(\s*['"]hex['"]\s*\)/);
  });

  it("compares signatures in constant time", () => {
    expect(source).toContain("timingSafeEqual");
  });

  it("selects the secret by the source header we send, defaulting to indexer", () => {
    expect(source).toContain(WEBHOOK_SOURCE_HEADER);

    const defaultSource = source.match(
      new RegExp(`\\[['"]${WEBHOOK_SOURCE_HEADER}['"]\\][\\s\\S]{0,80}?['"](\\w+)['"]`),
    )?.[1];

    expect(defaultSource).toBe(WEBHOOK_SOURCE);
  });

  it("reads the same secret env var we sign with", () => {
    const readEnvVars = [
      ...source.matchAll(/get<string>\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g),
    ].map((match) => match[1]);

    expect(readEnvVars).toContain(WEBHOOK_SIGNATURE_SECRET_ENV);
  });

  it("treats a missing signature as unauthorized rather than allowing it", () => {
    // A contract that fails open would make every drift invisible.
    expect(source).toContain("UnauthorizedException");
  });
});
