/**
 * Preview formatting helpers for LivePreview component
 * Provides consistent, placeholder-safe formatting for raffle preview fields
 */

import type { RaffleFormData } from "../../types/types";

/**
 * Format duration with placeholder-safe handling
 * @param days - Number of days
 * @param hours - Number of hours
 * @returns Formatted duration string or placeholder
 */
export function formatDuration(days: number, hours: number): string {
  if (days === 0 && hours === 0) return "Duration not set";
  return `${days}d ${hours}h`;
}

/**
 * Format price with placeholder-safe handling
 * @param price - Price per ticket
 * @returns Formatted price string or placeholder
 */
export function formatPrice(price: number): string {
  if (price === 0) return "Price not set";
  return `$${price.toFixed(2)}`;
}

/**
 * Format ticket count with placeholder-safe handling
 * @param tickets - Total number of tickets
 * @returns Formatted ticket string or placeholder
 */
export function formatTickets(tickets: number): string {
  if (tickets === 0) return "—";
  return tickets.toString();
}

/**
 * Format title with placeholder-safe handling
 * @param title - Raffle title
 * @returns Title or placeholder
 */
export function formatTitle(title: string): string {
  return title || "Raffle title not set";
}

/**
 * Format description with placeholder-safe handling
 * @param description - Raffle description
 * @returns Description or placeholder
 */
export function formatDescription(description: string): string {
  return description || "No description provided";
}

/**
 * Get placeholder text for missing creator
 * @returns Placeholder text for creator
 */
export function getCreatorPlaceholder(): string {
  return "Creator not set";
}

/**
 * Get placeholder text for missing close time
 * @returns Placeholder text for close time
 */
export function getCloseTimePlaceholder(): string {
  return "Close time not set";
}

/**
 * Check if form data is empty (all fields are unset)
 * @param formData - Raffle form data
 * @returns True if form is empty
 */
export function isFormDataEmpty(formData: RaffleFormData): boolean {
  return (
    !formData.title &&
    !formData.description &&
    formData.images.length === 0 &&
    formData.pricePerTicket === 0 &&
    formData.totalTickets === 0 &&
    formData.duration.days === 0 &&
    formData.duration.hours === 0
  );
}

/**
 * Check if form data is complete (all required fields are set)
 * @param formData - Raffle form data
 * @returns True if form is complete
 */
export function isFormDataComplete(formData: RaffleFormData): boolean {
  return (
    !!formData.title &&
    !!formData.description &&
    formData.images.length > 0 &&
    formData.pricePerTicket > 0 &&
    formData.totalTickets > 0 &&
    (formData.duration.days > 0 || formData.duration.hours > 0)
  );
}
