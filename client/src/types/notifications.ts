// ============================================
// NOTIFICATION TYPES
// ============================================

export type NotificationChannel = "email" | "push";

export interface NotificationSubscription {
  id: string;
  raffleId: number;
  userAddress: string;
  channel: NotificationChannel;
  createdAt: string;
}

export interface NotificationPreferences {
  raffleEnd: boolean;
  winNotification: boolean;
  channel: NotificationChannel;
}
