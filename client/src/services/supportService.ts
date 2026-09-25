import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";
import type { SupportTicketDTO } from "../types/api-types";

export type { SupportTicketDTO };

export async function sendSupportTicket(data: SupportTicketDTO): Promise<void> {
  await api.post(API_CONFIG.endpoints.support.contact, data, {
    requiresAuth: false,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
