# Notification Preferences Integration Guide

This document shows how to integrate notification preferences into your notification sending logic.

## Overview

The notification preferences system automatically filters subscribers based on their opt-in/opt-out settings. Always use the preference-aware methods when retrieving subscribers.

## Example: Raffle End Notification

When a raffle ends, send notifications only to users who have opted in:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { PushNotificationService } from '../services/push-notification.service';

@Injectable()
export class RaffleNotificationHandler {
  private readonly logger = new Logger(RaffleNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async sendRaffleEndNotifications(raffleId: number): Promise<void> {
    // Get subscribers who have opted in for raffle end notifications
    const subscribers = await this.notificationService.getRaffleEndSubscribers(raffleId);

    this.logger.log(
      `Sending raffle end notifications to ${subscribers.length} subscribers for raffle ${raffleId}`,
    );

    for (const subscriber of subscribers) {
      try {
        if (subscriber.channel === 'push') {
          await this.pushNotificationService.sendToUser(subscriber.user_address, {
            title: 'Raffle Ended',
            body: `Raffle #${raffleId} has ended. Check to see if you won!`,
            data: {
              raffleId,
              type: 'raffle_end',
            },
          });
        } else if (subscriber.channel === 'email') {
          // TODO: Implement email sending
          this.logger.log(`Would send email to ${subscriber.user_address}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send raffle end notification to ${subscriber.user_address}: ${error.message}`,
        );
      }
    }
  }
}
```

## Example: Winner Notification

When a winner is selected, send notifications only to users who have opted in:

```typescript
@Injectable()
export class WinnerNotificationHandler {
  private readonly logger = new Logger(WinnerNotificationHandler.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async sendWinnerNotifications(raffleId: number, winnerAddress: string): Promise<void> {
    // Get subscribers who have opted in for win notifications
    const subscribers = await this.notificationService.getWinnerSubscribers(raffleId);

    // Filter to only send to the actual winner
    const winner = subscribers.find(sub => sub.user_address === winnerAddress);

    if (!winner) {
      this.logger.log(
        `Winner ${winnerAddress} is not subscribed or has opted out of win notifications`,
      );
      return;
    }

    this.logger.log(`Sending win notification to ${winnerAddress} for raffle ${raffleId}`);

    try {
      if (winner.channel === 'push') {
        await this.pushNotificationService.sendToUser(winner.user_address, {
          title: '🎉 You Won!',
          body: `Congratulations! You won raffle #${raffleId}!`,
          data: {
            raffleId,
            type: 'winner',
          },
        });
      } else if (winner.channel === 'email') {
        // TODO: Implement email sending
        this.logger.log(`Would send winner email to ${winner.user_address}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send win notification to ${winner.user_address}: ${error.message}`,
      );
    }
  }
}
```

## Example: Event Processor Integration

Integrate with your event processor to automatically send notifications:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { WebhookService } from '../services/webhook.service';
import { RaffleNotificationHandler } from './raffle-notification.handler';
import { WinnerNotificationHandler } from './winner-notification.handler';

export interface RaffleEvent {
  ledger?: number;
  eventType?: string;
  raffleId?: number;
  winner?: string;
  [key: string]: unknown;
}

@Injectable()
export class RaffleEventProcessor {
  private readonly logger = new Logger(RaffleEventProcessor.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly raffleNotificationHandler: RaffleNotificationHandler,
    private readonly winnerNotificationHandler: WinnerNotificationHandler,
  ) {}

  async processEvent(event: RaffleEvent): Promise<void> {
    try {
      this.logger.log(`Processing event: ${event.eventType} for raffle ${event.raffleId}`);

      // Trigger webhooks
      if (event.eventType && event.raffleId) {
        await this.webhookService.triggerWebhooks(event.eventType, {
          raffleId: event.raffleId,
          ...event,
        });
      }

      // Send notifications based on event type
      if (event.eventType === 'raffle_ended' && event.raffleId) {
        await this.raffleNotificationHandler.sendRaffleEndNotifications(event.raffleId);
      }

      if (event.eventType === 'winner_selected' && event.raffleId && event.winner) {
        await this.winnerNotificationHandler.sendWinnerNotifications(
          event.raffleId,
          event.winner,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process event: ${error.message}`);
    }
  }
}
```

## Testing Notification Preferences

### Test User Opt-Out Behavior

```typescript
describe('Raffle End Notifications with Preferences', () => {
  it('should not send notification to users who opted out', async () => {
    const raffleId = 1;
    
    // User opts out of raffle end notifications
    await notificationService.updatePreferences('USER1', {
      raffleEnd: false,
    });

    // Subscribe to raffle
    await notificationService.subscribe({
      raffleId,
      userAddress: 'USER1',
      channel: 'email',
    });

    // Get filtered subscribers
    const subscribers = await notificationService.getRaffleEndSubscribers(raffleId);

    // USER1 should not be in the list
    expect(subscribers.find(s => s.user_address === 'USER1')).toBeUndefined();
  });

  it('should send notification to users who are opted in', async () => {
    const raffleId = 1;
    
    // User is opted in (default)
    await notificationService.subscribe({
      raffleId,
      userAddress: 'USER2',
      channel: 'push',
    });

    const subscribers = await notificationService.getRaffleEndSubscribers(raffleId);

    expect(subscribers.find(s => s.user_address === 'USER2')).toBeDefined();
  });
});
```

## Performance Considerations

The filtering methods (`getRaffleEndSubscribers`, `getWinnerSubscribers`) make one database query to get all subscribers, then individual queries to check each subscriber's preferences. For raffles with many subscribers, consider:

1. **Caching**: Cache user preferences temporarily during batch operations
2. **Batch Queries**: Fetch all preferences in a single query
3. **Background Processing**: Queue notification jobs for processing outside the request cycle

### Example: Batch Preference Loading

```typescript
async getRaffleEndSubscribersBatch(raffleId: number): Promise<NotificationSubscription[]> {
  const allSubscribers = await this.getRaffleSubscribers(raffleId);
  
  if (allSubscribers.length === 0) {
    return [];
  }

  // Fetch all preferences in one query
  const addresses = allSubscribers.map(sub => sub.user_address);
  const { data: preferences, error } = await this.client
    .from(PREFERENCES_TABLE)
    .select('*')
    .in('user_address', addresses);

  if (error) {
    throw new Error(`Failed to fetch preferences: ${error.message}`);
  }

  const prefsMap = new Map(
    (preferences || []).map(p => [p.user_address, p])
  );

  // Filter based on preferences
  return allSubscribers.filter(sub => {
    const prefs = prefsMap.get(sub.user_address);
    // Default to true if no preferences set
    return prefs ? prefs.raffle_end : true;
  });
}
```

## Migration Strategy

When deploying this feature:

1. **Run the migration**: Execute `014_notification_preferences.sql` in Supabase
2. **Default behavior**: All existing users are opted-in by default (backward compatible)
3. **Update notification code**: Replace `getRaffleSubscribers` with preference-aware methods
4. **Monitor**: Check logs to ensure notifications are being filtered correctly
5. **Communicate**: Inform users about the new preference controls in the UI
