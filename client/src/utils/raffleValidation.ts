import { z } from "zod";

export const CreateRaffleFormSchema = z.object({
  ticketPrice: z.string().min(1, "Ticket price is required"),
  totalTickets: z.number().int().positive("Total tickets must be a positive integer"),
  durationInSeconds: z.number().int().positive("Duration must be at least 1 second"),
});

export type CreateRaffleFormData = z.infer<typeof CreateRaffleFormSchema>;
