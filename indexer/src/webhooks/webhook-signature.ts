import { createHmac } from "crypto";

/**
 * The outbound half of the webhook signature contract.
 *
 * The inbound half lives in
 * `backend/src/api/rest/webhooks/webhook-signature-verification.interceptor.ts`.
 * That file reads the signature from `x-webhook-signature`, selects the secret
 * from the `x-tikka-webhook-source` header (defaulting to `indexer`), and
 * compares HMAC-SHA256 hex computed over the request's **raw body**. Every
 * constant below mirrors it.
 *
 * Two things about that contract are easy to get wrong and are therefore
 * asserted in `webhook-signature.spec.ts`:
 *
 *  1. The signature covers the exact bytes of the body that is sent. Sign one
 *     serialization and send another and verification fails, so callers
 *     serialize once and sign that value.
 *  2. The two ends cannot be allowed to drift. That spec reads the interceptor
 *     source from disk and fails if the header name, algorithm, digest
 *     encoding, source default, or secret env var no longer match.
 */

/** Header carrying the hex HMAC-SHA256 of the raw body. */
export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";

/** Header selecting which secret the receiver uses. */
export const WEBHOOK_SOURCE_HEADER = "x-tikka-webhook-source";

/** Header carrying the id a subscriber deduplicates deliveries on. */
export const WEBHOOK_DELIVERY_ID_HEADER = "x-webhook-delivery-id";

/** The source value the receiver maps to the indexer's secret. */
export const WEBHOOK_SOURCE = "indexer";

/** Env var holding the shared secret; read by both ends. */
export const WEBHOOK_SIGNATURE_SECRET_ENV = "INDEXER_WEBHOOK_SECRET";

/**
 * Signature for `rawBody` under `secret`, as the receiver computes it.
 *
 * `rawBody` must be the exact string (or buffer) put on the wire.
 */
export function signWebhookBody(
  secret: string,
  rawBody: string | Buffer,
): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Read the signing secret from the environment.
 *
 * Returns `undefined` when unset or empty rather than an empty string: an
 * empty secret still produces a valid-looking signature, which is the one
 * outcome worse than sending none at all.
 */
export function resolveWebhookSignatureSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const secret = env[WEBHOOK_SIGNATURE_SECRET_ENV];
  return secret && secret.length > 0 ? secret : undefined;
}

export interface WebhookHeaderInput {
  /** Omit to send an unsigned request. */
  secret?: string;
  /** The exact body that will be sent. */
  rawBody: string;
  /** Stable across retries of one logical delivery. */
  deliveryId: string;
}

/**
 * Build the request headers for a delivery.
 *
 * The delivery id and source are always sent; the signature is sent only when
 * a secret is configured. Callers that find no secret should warn — an
 * unsigned delivery is rejected by any consumer that verifies (including our
 * own backend), so the absence is a misconfiguration, not a normal state.
 */
export function buildWebhookHeaders({
  secret,
  rawBody,
  deliveryId,
}: WebhookHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
    [WEBHOOK_SOURCE_HEADER]: WEBHOOK_SOURCE,
  };

  if (secret) {
    headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookBody(secret, rawBody);
  }

  return headers;
}
