import { Inject, Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase.provider';
import { env } from '../config/env.config';
import * as admin from 'firebase-admin';

const TABLE = 'push_tokens';

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

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private fcmAppInitialized = false;

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

  private mapData(data: Record<string, string | number | boolean> | undefined) {
    if (!data) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)]),
    );
  }

  async sendToUser(userAddress: string, payload: PushNotificationPayload) {
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
      this.logger.error('FCM sendEachForMulticast failed', error);
      throw new InternalServerErrorException('Failed to send push notification');
    }

    const invalidTokens = response.responses
      .map((r: admin.messaging.SendResponse, idx: number) => ({ result: r, token: tokens[idx] }))
      .filter((entry: { result: admin.messaging.SendResponse; token: string }) => !entry.result.success)
      .filter((entry: { result: admin.messaging.SendResponse; token: string }) => {
        const code = (entry.result.error as admin.FirebaseError | undefined)?.code;
        return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
      })
      .map((entry: { result: admin.messaging.SendResponse; token: string }) => entry.token);

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
    };
  }
}
