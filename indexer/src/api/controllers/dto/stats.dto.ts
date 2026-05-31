/**
 * Platform Statistics DTOs — aggregated, cache-friendly responses.
 * Hide internal fields like storage date, raw aggregation details.
 */

export interface PlatformStatDto {
  date: string | null; // ISO date string or null
  total_raffles: number;
  total_tickets: number;
  total_volume_xlm: string;
  unique_participants: number;
  prizes_distributed_xlm: string;
  active_raffles: number;
  total_users: number;
}
