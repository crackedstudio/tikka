import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Observable, throwError } from 'rxjs';

const SIGNATURE_HEADER = 'x-webhook-signature';
const TIMESTAMP_HEADER = 'x-webhook-timestamp';
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface WebhookVerificationResult {
    valid: boolean;
    error?: string;
}

@Injectable()
export class WebhookSignatureVerificationInterceptor
    implements NestInterceptor {
    constructor(private readonly configService: ConfigService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const http = context.switchToHttp();
        const req = http.getRequest<Request & { rawBody?: Buffer }>();

        // Only verify for controllers that opt-in (rawBody must be present)
        const rawBody = req.rawBody;
        if (!rawBody) {
            // If a route doesn't have raw body, treat as unsigned.
            throw new UnauthorizedException('Missing webhook signature');
        }

        const signatureHeader = (req.headers as any)[SIGNATURE_HEADER];
        if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        // Source selection
        // Expected headers: X-Tikka-Webhook-Source: indexer|supabase|...
        const source = ((req.headers as any)['x-tikka-webhook-source'] as string) ||
            'indexer';

        const secret = this.getSecretForSource(source);
        
        // Verify signature
        const expected = this.computeSignatureHex(secret, rawBody);
        const providedBuf = Buffer.from(signatureHeader, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');

        // timingSafeEqual requires same length
        if (
            providedBuf.length !== expectedBuf.length ||
            !timingSafeEqual(providedBuf, expectedBuf)
        ) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        return next.handle();
    }

    private getSecretForSource(source: string): string {
        // Per-source env vars (only indexer is used today, but structure supports others)
        if (source === 'indexer') {
            return this.configService.get<string>('INDEXER_WEBHOOK_SECRET') ?? '';
        }

        // Fallback (still verify, but will fail if empty)
        const key = `${source.toUpperCase()}_WEBHOOK_SECRET`;
        return this.configService.get<string>(key) ?? '';
    }

    private computeSignatureHex(secret: string, rawBody: Buffer): string {
        return createHmac('sha256', secret).update(rawBody).digest('hex');
    }

    /**
     * Verifies webhook signature and timestamp.
     * Extracted for testability.
     * 
     * @param secret - The webhook secret
     * @param rawBody - The raw request body
     * @param signatureHeader - The provided signature hex string
     * @param timestampHeader - The provided timestamp (ISO string or epoch ms)
     * @returns Verification result with validity status and optional error message
     */
    static verifyWebhook(
        secret: string,
        rawBody: Buffer,
        signatureHeader: string,
        timestampHeader?: string,
    ): WebhookVerificationResult {
        // Check timestamp if provided
        if (timestampHeader) {
            const timestamp = Date.parse(timestampHeader);
            if (isNaN(timestamp)) {
                return { valid: false, error: 'Invalid timestamp format' };
            }

            const now = Date.now();
            const age = now - timestamp;
            if (age > MAX_TIMESTAMP_AGE_MS) {
                return { valid: false, error: 'Webhook timestamp too old' };
            }

            if (age < -MAX_TIMESTAMP_AGE_MS) {
                return { valid: false, error: 'Webhook timestamp in the future' };
            }
        }

        // Verify signature
        const expected = createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

        const providedBuf = Buffer.from(signatureHeader, 'hex');
        const expectedBuf = Buffer.from(expected, 'hex');

        if (
            providedBuf.length !== expectedBuf.length ||
            !timingSafeEqual(providedBuf, expectedBuf)
        ) {
            return { valid: false, error: 'Invalid webhook signature' };
        }

        return { valid: true };
    }
}