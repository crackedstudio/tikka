export interface WebhookPayload {
  eventType: "RaffleCreated" | "RaffleFinalized";
  raffleId: number;
  timestamp: string;
  data: Record<string, any>;
}

export type SupportedWebhookEvents = "RaffleCreated" | "RaffleFinalized";
