import { api } from "./apiClient";
import { API_CONFIG } from "../config/api";

export interface SupportTicketDTO {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendSupportTicket(data: SupportTicketDTO): Promise<void> {
  await api.post(API_CONFIG.endpoints.support.contact, data, {
    requiresAuth: false,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
