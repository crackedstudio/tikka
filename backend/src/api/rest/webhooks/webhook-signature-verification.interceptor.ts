import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Observable } from 'rxjs';

const SIGNATURE_HEADERS = ['x-webhook-signature', 'x-tikka-signature'] as const;
const ALGORITHM_HEADERS = [
  'x-webhook-signature-algorithm',
  'x-webhook-algorithm',
  'x-tikka-signature-algorithm',
] as const;
const TIMESTAMP_HEADERS = ['x-webhook-timestamp', 'x-tikka-timestamp'] as const;
const SOURCE_HEADERS = ['x-tikka-webhook-source'] as const;
const SUPPORTED_ALGORITHM = 'sha256';
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;
const HMAC_SHA256_BYTES = 32;
const HEX_SIGNATURE_PATTERN = /^[0-9a-fA-F]{64}$/;

type WebhookRequest = {
  rawBody?: Buffer | Uint8Array | string;
  headers?: Record<string, unknown>;
};

type TimestampValue = {
  present: boolean;
  value: number | null;
  raw?: string;
};

@Injectable()
export class WebhookSignatureVerificationInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<WebhookRequest>();
    const rawBody = this.getRawBody(request);
    if (rawBody === null) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const signatureHeader = this.getHeader(request, SIGNATURE_HEADERS);
    if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const algorithmHeader = this.getHeader(request, ALGORITHM_HEADERS);
    if (algorithmHeader !== undefined && typeof algorithmHeader !== 'string') {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (this.normalizeAlgorithm(algorithmHeader) === null) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const sourceHeader = this.getHeader(request, SOURCE_HEADERS);
    if (sourceHeader !== undefined && typeof sourceHeader !== 'string') {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const source = sourceHeader === undefined ? 'indexer' : sourceHeader;
    if (!/^[a-z0-9_-]+$/i.test(source)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    const secret = this.getSecretForSource(source);
    if (secret.length === 0) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const provided = this.decodeSignature(
      signatureHeader,
      this.normalizeAlgorithm(algorithmHeader) ?? SUPPORTED_ALGORITHM,
    );
    const bodyTimestamp = this.getBodyTimestamp(rawBody);
    const headerTimestamp = this.getHeaderTimestamp(request);
    const signedPayload = this.getSignedPayload(rawBody, bodyTimestamp, headerTimestamp);
    const expected = createHmac('sha256', secret).update(signedPayload).digest();
    const comparisonValue =
      provided !== null && provided.length === HMAC_SHA256_BYTES
        ? provided
        : Buffer.alloc(HMAC_SHA256_BYTES);
    const comparisonMatches = timingSafeEqual(comparisonValue, expected);
    if (
      provided === null ||
      provided.length !== expected.length ||
      !comparisonMatches ||
      !this.hasFreshTimestamp(bodyTimestamp, headerTimestamp)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return next.handle();
  }

  private getRawBody(request: WebhookRequest): Buffer | null {
    const rawBody = request?.rawBody;
    if (Buffer.isBuffer(rawBody)) {
      return rawBody;
    }
    if (typeof rawBody === 'string') {
      return Buffer.from(rawBody, 'utf8');
    }
    if (rawBody instanceof Uint8Array) {
      return Buffer.from(rawBody);
    }
    return null;
  }

  private getHeader(request: WebhookRequest, names: readonly string[]): unknown {
    const headers = request?.headers ?? {};
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(headers, name)) {
        return headers[name];
      }
      const matchingName = Object.keys(headers).find(
        (headerName) => headerName.toLowerCase() === name,
      );
      if (matchingName !== undefined) {
        return headers[matchingName];
      }
    }
    return undefined;
  }

  private getSecretForSource(source: string): string {
    const key =
      source === 'indexer' ? 'INDEXER_WEBHOOK_SECRET' : `${source.toUpperCase()}_WEBHOOK_SECRET`;
    const secret = this.configService.get<string>(key);
    return typeof secret === 'string' ? secret : '';
  }

  private normalizeAlgorithm(value: unknown): string | null {
    if (value === undefined) {
      return SUPPORTED_ALGORITHM;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === SUPPORTED_ALGORITHM || normalized === 'v1') {
      return SUPPORTED_ALGORITHM;
    }
    if (normalized === 'hmac-sha256' || normalized === 'hmac_sha256') {
      return SUPPORTED_ALGORITHM;
    }
    return null;
  }

  private decodeSignature(value: string, algorithm: string): Buffer | null {
    let encoded = value;
    const separatorIndex = value.search(/[=:]/);
    if (separatorIndex >= 0) {
      const prefix = value.slice(0, separatorIndex);
      if (this.normalizeAlgorithm(prefix) !== algorithm) {
        return null;
      }
      encoded = value.slice(separatorIndex + 1);
    }
    if (!HEX_SIGNATURE_PATTERN.test(encoded)) {
      return null;
    }
    return Buffer.from(encoded, 'hex');
  }

  private getBodyTimestamp(rawBody: Buffer): TimestampValue {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { present: false, value: null };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: false, value: null };
    }
    const record = parsed as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, 'timestamp')) {
      return { present: false, value: null };
    }
    return { present: true, value: this.parseTimestamp(record.timestamp) };
  }

  private getHeaderTimestamp(request: WebhookRequest): TimestampValue {
    const value = this.getHeader(request, TIMESTAMP_HEADERS);
    if (value === undefined) {
      return { present: false, value: null };
    }
    if (typeof value !== 'string') {
      return { present: true, value: null };
    }
    return {
      present: true,
      value: this.parseTimestamp(value),
      raw: value,
    };
  }

  private getSignedPayload(
    rawBody: Buffer,
    bodyTimestamp: TimestampValue,
    headerTimestamp: TimestampValue,
  ): Buffer {
    if (bodyTimestamp.present && bodyTimestamp.value !== null) {
      return rawBody;
    }
    if (headerTimestamp.present && headerTimestamp.raw !== undefined) {
      return Buffer.concat([Buffer.from(`${headerTimestamp.raw}.`, 'utf8'), rawBody]);
    }
    return rawBody;
  }

  private hasFreshTimestamp(
    bodyTimestamp: TimestampValue,
    headerTimestamp: TimestampValue,
  ): boolean {
    if (bodyTimestamp.present) {
      if (bodyTimestamp.value === null) {
        return false;
      }
      if (
        headerTimestamp.present &&
        (headerTimestamp.value === null || headerTimestamp.value !== bodyTimestamp.value)
      ) {
        return false;
      }
      return this.isFreshTimestamp(bodyTimestamp.value);
    }
    if (headerTimestamp.present && headerTimestamp.value !== null) {
      return this.isFreshTimestamp(headerTimestamp.value);
    }
    return false;
  }

  private isFreshTimestamp(timestamp: number): boolean {
    const age = Date.now() - timestamp;
    return age <= MAX_TIMESTAMP_AGE_MS && age >= -MAX_TIMESTAMP_AGE_MS;
  }

  private parseTimestamp(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? this.normalizeTimestamp(value) : null;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const numericValue = Number(trimmed);
      return Number.isFinite(numericValue) ? this.normalizeTimestamp(numericValue) : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private normalizeTimestamp(value: number): number {
    return Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
  }
}
