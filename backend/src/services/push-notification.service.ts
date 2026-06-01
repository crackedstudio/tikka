import { Inject, Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { env } from '../config/env.config';
import * as admin from 'firebase-admin';

const TABLE = 'push_tokens';
const FAILURE_TABLE = 'push_delivery_failures';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean>;
}

export interface PushTokenRecord {
  user_address: string;
  device_token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

/**
 * How a failed delivery attempt should be handled.
 */
export enum DeliveryFailureClass {
  /** Provider-side / network condition that may succeed on a later attempt. */
  TRANSIENT_RETRY = 'transient_retry',
  /** Token is dead or malformed; remove it so we stop trying. */
  PERMANENT_INVALID_TOKEN = 'permanent_invalid_token',
  /** Caller- or config-side error (bad payload, auth); retrying won't help. */
  PERMANENT_OTHER = 'permanent_other',
  /** Whole-batch provider failure (5xx / timeout / unreachable). Retryable. */
  PROVIDER_OUTAGE = 'provider_outage',
}

/** Concrete operator-facing action implied by a failure class. */
export type DeliveryNextAction = 'retry' | 'remove_token' | 'drop';

export interface DeliveryFailure {
  /** Token that failed, or null for whole-batch outages. */
  token: string | null;
  errorCode: string;
  classification: DeliveryFailureClass;
  nextAction: DeliveryNextAction;
}

export interface DeliveryMetrics {
  transientRetry: number;
  permanentInvalidToken: number;
  permanentOther: number;
  providerOutage: number;
  /** Sum of all recorded failures since process start. */
  totalFailures: number;
}

export interface SendResult {
  successCount: number;
  failureCount: number;
  /** Tokens removed because they were permanently invalid. */
  invalidTokens: string[];
  /** Tokens whose failures are eligible for a later retry. */
  retryableTokens: string[];
  /** Every classified failure from this send. */
  failures: DeliveryFailure[];
  /** True when the whole batch failed at the provider (retry the lot). */
  providerOutage: boolean;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private fcmAppInitialized = false;

  private readonly metrics: DeliveryMetrics = {
    transientRetry: 0,
    permanentInvalidToken: 0,
    permanentOther: 0,
    providerOutage: 0,
    totalFailures: 0,
  };

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (this.fcmAppInitialized) {
      return;
    }

    if (!env.fcm.enabled) {
      this.logger.log('FCM is disabled (FCM_ENABLED=false). Push notifications will be no-op.');
      return;
    }

    const serviceAccountJson = env.fcm.serviceAccountJson;
    const serviceAccountPath = env.fcm.serviceAccountPath;

    if (!serviceAccountJson && !serviceAccountPath) {
      throw new InternalServerErrorException(
        'FCM is enabled but no service account configuration provided. Set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.',
      );
    }

    const credentials = serviceAccountJson
      ? JSON.parse(serviceAccountJson)
      : require(serviceAccountPath as string);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials as admin.ServiceAccount),
      });
    }

    this.fcmAppInitialized = true;
    this.logger.log('FCM initialized successfully.');
  }

  async registerDeviceToken(
    userAddress: string,
    deviceToken: string,
    platform = 'fcm',
  ): Promise<PushTokenRecord> {
    if (!userAddress || !deviceToken) {
      throw new InternalServerErrorException('userAddress and deviceToken are required');
    }

    const row = {
      user_address: userAddress,
      device_token: deviceToken,
      platform,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from(TABLE)
      .upsert(row, { onConflict: 'user_address,device_token' })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to register device token', error);
      throw new InternalServerErrorException(`Failed to register device token: ${error.message}`);
    }

    return data as PushTokenRecord;
  }

  async unregisterDeviceToken(userAddress: string, deviceToken: string): Promise<void> {
    if (!userAddress || !deviceToken) {
      throw new InternalServerErrorException('userAddress and deviceToken are required');
    }

    const { error } = await this.client
      .from(TABLE)
      .delete()
      .eq('user_address', userAddress)
      .eq('device_token', deviceToken);

    if (error) {
      this.logger.error('Failed to unregister device token', error);
      throw new InternalServerErrorException(`Failed to unregister device token: ${error.message}`);
    }
  }

  async getDeviceTokens(userAddress: string): Promise<PushTokenRecord[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('user_address', userAddress);

    if (error) {
      this.logger.error('Failed to fetch device tokens', error);
      throw new InternalServerErrorException(`Failed to fetch device tokens: ${error.message}`);
    }

    return (data as PushTokenRecord[]) || [];
  }

  /**
   * Snapshot of failure counts since process start. Read live by HealthService
   * so operators can see undelivered notification classes on /health.
   */
  getDeliveryMetrics(): DeliveryMetrics {
    return { ...this.metrics };
  }

  /**
   * Map an FCM error code to a failure class plus the action to take.
   * Reference: firebase-admin messaging error codes.
   */
  classifyFcmError(code: string | undefined): { classification: DeliveryFailureClass; nextAction: DeliveryNextAction } {
    switch (code) {
      // Token is dead or not a valid registration token: stop using it.
      case 'messaging/registration-token-not-registered':
      case 'messaging/invalid-registration-token':
        return { classification: DeliveryFailureClass.PERMANENT_INVALID_TOKEN, nextAction: 'remove_token' };

      // Provider-side conditions that typically clear on their own.
      case 'messaging/internal-error':
      case 'messaging/server-unavailable':
      case 'messaging/quota-exceeded':
      case 'messaging/unavailable':
      case 'messaging/unknown-error':
        return { classification: DeliveryFailureClass.TRANSIENT_RETRY, nextAction: 'retry' };

      // Caller/config errors: bad payload, wrong/missing credentials.
      case 'messaging/invalid-argument':
      case 'messaging/invalid-payload':
      case 'messaging/authentication-error':
      case 'messaging/mismatched-credential':
      case 'messaging/third-party-auth-error':
        return { classification: DeliveryFailureClass.PERMANENT_OTHER, nextAction: 'drop' };

      // Unknown codes: treat conservatively as retryable rather than dropping.
      default:
        return { classification: DeliveryFailureClass.TRANSIENT_RETRY, nextAction: 'retry' };
    }
  }

  private bumpMetric(classification: DeliveryFailureClass) {
    switch (classification) {
      case DeliveryFailureClass.TRANSIENT_RETRY:
        this.metrics.transientRetry += 1;
        break;
      case DeliveryFailureClass.PERMANENT_INVALID_TOKEN:
        this.metrics.permanentInvalidToken += 1;
        break;
      case DeliveryFailureClass.PERMANENT_OTHER:
        this.metrics.permanentOther += 1;
        break;
      case DeliveryFailureClass.PROVIDER_OUTAGE:
        this.metrics.providerOutage += 1;
        break;
    }
    this.metrics.totalFailures += 1;
  }

  /**
   * Record a failed delivery attempt: bump the in-memory counter (read by
   * health metrics) and best-effort persist a durable row for later operator
   * querying. Persistence failures must never break a send.
   */
  private async recordFailure(userAddress: string, failure: DeliveryFailure): Promise<void> {
    this.bumpMetric(failure.classification);

    try {
      await this.client.from(FAILURE_TABLE).insert({
        user_address: userAddress,
        device_token: failure.token,
        error_code: failure.errorCode,
        classification: failure.classification,
        next_action: failure.nextAction,
      });
    } catch (error) {
      // Durable logging is best-effort; never let it interrupt delivery.
      this.logger.warn(`Failed to persist delivery failure: ${(error as Error).message}`);
    }
  }

  private mapData(data: Record<string, string | number | boolean> | undefined) {
    if (!data) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)]),
    );
  }

  async sendToUser(userAddress: string, payload: PushNotificationPayload): Promise<SendResult> {
    const tokens = (await this.getDeviceTokens(userAddress)).map((t) => t.device_token);

    if (tokens.length === 0) {
      throw new NotFoundException(`No push tokens registered for user ${userAddress}`);
    }

    if (!env.fcm.enabled || !this.fcmAppInitialized) {
      throw new InternalServerErrorException('FCM is not configured or disabled. Set FCM_ENABLED=true and configure credentials.');
    }

    const message = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: this.mapData(payload.data),
    };

    let response: admin.messaging.BatchResponse;
    try {
      response = await admin.messaging().sendEachForMulticast(message);
    } catch (error) {
      // Whole-batch failure: provider unreachable / 5xx / timeout. Retry the lot.
      const code = (error as admin.FirebaseError | undefined)?.code ?? 'messaging/server-unavailable';
      const outage: DeliveryFailure = {
        token: null,
        errorCode: code,
        classification: DeliveryFailureClass.PROVIDER_OUTAGE,
        nextAction: 'retry',
      };
      await this.recordFailure(userAddress, outage);
      this.logger.error('FCM sendEachForMulticast failed (provider outage)', error);
      throw new InternalServerErrorException('Push provider unavailable; delivery will be retried');
    }

    const failures: DeliveryFailure[] = [];
    const invalidTokens: string[] = [];
    const retryableTokens: string[] = [];

    response.responses.forEach((r: admin.messaging.SendResponse, idx: number) => {
      if (r.success) {
        return;
      }

      const token = tokens[idx];
      const code = (r.error as admin.FirebaseError | undefined)?.code;
      const { classification, nextAction } = this.classifyFcmError(code);
      const failure: DeliveryFailure = {
        token,
        errorCode: code ?? 'messaging/unknown-error',
        classification,
        nextAction,
      };
      failures.push(failure);

      if (nextAction === 'remove_token') {
        invalidTokens.push(token);
      } else if (nextAction === 'retry') {
        retryableTokens.push(token);
      }
    });

    // Record every per-token failure (counters + durable log).
    await Promise.all(failures.map((f) => this.recordFailure(userAddress, f)));

    if (invalidTokens.length > 0) {
      await this.client
        .from(TABLE)
        .delete()
        .eq('user_address', userAddress)
        .in('device_token', invalidTokens);

      this.logger.log(`Removed ${invalidTokens.length} stale FCM token(s)`);
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
      retryableTokens,
      failures,
      providerOutage: false,
    };
  }
}