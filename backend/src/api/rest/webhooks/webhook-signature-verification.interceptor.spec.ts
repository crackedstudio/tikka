import {
    CallHandler,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { firstValueFrom, of } from 'rxjs';
import { WebhookSignatureVerificationInterceptor } from './webhook-signature-verification.interceptor';

/**
 * The inbound half of the webhook signature contract.
 *
 * The indexer signs with this scheme; if this side changes what it accepts and
 * nobody notices, every delivery turns into a 401 that looks like a subscriber
 * outage. So the cases here are the ones an operator would be paged about:
 * a missing header, a wrong secret, a tampered body, and an unconfigured
 * secret (which must reject — HMAC with an empty key is forgeable by anyone
 * who knows the scheme).
 */

const SECRET = 'indexer-shared-secret';
const RAW_BODY = Buffer.from(
    JSON.stringify({ eventType: 'RaffleCreated', data: { raffleId: 7 } }),
    'utf8',
);

/** Exactly what the indexer's `signWebhookBody` computes. */
function sign(rawBody: Buffer | string, secret: string): string {
    return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * A ConfigService over a map the test can mutate. The map is closed over by
 * reference, so a test reconfigure (add a source, remove the indexer secret)
 * takes effect without rebuilding the interceptor.
 */
function makeConfig(map: Record<string, string | undefined>): ConfigService {
    return { get: (key: string) => map[key] } as unknown as ConfigService;
}

function makeContext(
    rawBody: Buffer | undefined,
    headers: Record<string, string> = {},
): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ rawBody, headers }),
        }),
    } as unknown as ExecutionContext;
}

const next: CallHandler = { handle: () => of('handled') };

describe('WebhookSignatureVerificationInterceptor', () => {
    let secrets: Record<string, string | undefined>;
    let interceptor: WebhookSignatureVerificationInterceptor;

    beforeEach(() => {
        secrets = { INDEXER_WEBHOOK_SECRET: SECRET };
        interceptor = new WebhookSignatureVerificationInterceptor(
            makeConfig(secrets),
        );
    });

    describe('rejects', () => {
        it('a request with no raw body', async () => {
            expect(() =>
                interceptor.intercept(makeContext(undefined), next),
            ).toThrow(UnauthorizedException);
        });

        it('a request with no signature header', () => {
            expect(() =>
                interceptor.intercept(makeContext(RAW_BODY), next),
            ).toThrow('Missing webhook signature');
        });

        it('a request with an empty signature header', () => {
            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, { 'x-webhook-signature': '' }),
                    next,
                ),
            ).toThrow('Missing webhook signature');
        });

        it('a malformed, shorter-than-digest signature', () => {
            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, { 'x-webhook-signature': 'deadbeef' }),
                    next,
                ),
            ).toThrow('Invalid webhook signature');
        });

        it('a same-length signature made with the wrong secret', () => {
            // The dangerous case: right shape, wrong key. Only a real
            // comparison catches this.
            const forged = sign(RAW_BODY, 'not-the-secret');

            expect(forged).toHaveLength(64);
            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, { 'x-webhook-signature': forged }),
                    next,
                ),
            ).toThrow('Invalid webhook signature');
        });

        it('a signature for a different body', () => {
            const signature = sign('{"eventType":"RaffleCreated"}', SECRET);

            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, { 'x-webhook-signature': signature }),
                    next,
                ),
            ).toThrow('Invalid webhook signature');
        });

        it('a request when its source has no secret configured', () => {
            secrets.INDEXER_WEBHOOK_SECRET = undefined;

            // The regression this guards: verifying against an empty key
            // accepts any signature an attacker computes the same way.
            const attackerSignature = sign(RAW_BODY, '');

            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, {
                        'x-webhook-signature': attackerSignature,
                    }),
                    next,
                ),
            ).toThrow('Webhook signature secret is not configured');
        });

        it('a request when the named source is unknown and unconfigured', () => {
            expect(() =>
                interceptor.intercept(
                    makeContext(RAW_BODY, {
                        'x-webhook-signature': sign(RAW_BODY, SECRET),
                        'x-tikka-webhook-source': 'someone-else',
                    }),
                    next,
                ),
            ).toThrow('Webhook signature secret is not configured');
        });
    });

    describe('accepts', () => {
        it('a correctly signed body', async () => {
            const result = interceptor.intercept(
                makeContext(RAW_BODY, {
                    'x-webhook-signature': sign(RAW_BODY, SECRET),
                    'x-tikka-webhook-source': 'indexer',
                }),
                next,
            );

            await expect(firstValueFrom(result)).resolves.toBe('handled');
        });

        it('a signed body with no source header, defaulting to indexer', async () => {
            const result = interceptor.intercept(
                makeContext(RAW_BODY, {
                    'x-webhook-signature': sign(RAW_BODY, SECRET),
                }),
                next,
            );

            await expect(firstValueFrom(result)).resolves.toBe('handled');
        });

        it('a body signed by the indexer signing scheme', async () => {
            // The indexer serializes once and signs those bytes; this is that
            // exact value, verified the way the receiver verifies it.
            const rawBody = JSON.stringify({
                eventType: 'RaffleCreated',
                data: { raffleId: 7 },
            });
            const signature = sign(rawBody, SECRET);

            const result = interceptor.intercept(
                makeContext(Buffer.from(rawBody, 'utf8'), {
                    'x-webhook-signature': signature,
                    'x-tikka-webhook-source': 'indexer',
                }),
                next,
            );

            await expect(firstValueFrom(result)).resolves.toBe('handled');
        });

        it('a signature from another configured source', async () => {
            secrets.SUPABASE_WEBHOOK_SECRET = 'supabase-secret';

            const result = interceptor.intercept(
                makeContext(RAW_BODY, {
                    'x-webhook-signature': sign(RAW_BODY, 'supabase-secret'),
                    'x-tikka-webhook-source': 'supabase',
                }),
                next,
            );

            await expect(firstValueFrom(result)).resolves.toBe('handled');
        });

        it('an uppercase hex signature, byte-comparison being case-insensitive', async () => {
            // Subscribers may re-encode the digest; hex is hex.
            const signature = sign(RAW_BODY, SECRET).toUpperCase();

            const result = interceptor.intercept(
                makeContext(RAW_BODY, { 'x-webhook-signature': signature }),
                next,
            );

            await expect(firstValueFrom(result)).resolves.toBe('handled');
        });
    });
});
