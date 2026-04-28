/**
 * Export all event handlers
 */
export * from "./base-event.handler";
export * from "./raffle-created.handler";
export * from "./ticket-purchased.handler";
export * from "./raffle-finalized.handler";

// Re-export for convenience
import { RaffleCreatedHandler } from "./raffle-created.handler";
import { TicketPurchasedHandler } from "./ticket-purchased.handler";
import { RaffleFinalizedHandler } from "./raffle-finalized.handler";

/**
 * Default handler classes available for registration
 */
export const DEFAULT_HANDLERS = {
  RaffleCreated: RaffleCreatedHandler,
  TicketPurchased: TicketPurchasedHandler,
  RaffleFinalized: RaffleFinalizedHandler,
} as const;
