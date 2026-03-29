import { z } from "zod";

export const SupportSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name."),
  email: z.string().email("Please enter a valid email address."),
  subject: z.string().trim().min(5, "Please enter a short subject."),
  message: z.string().trim().min(10, "Please provide more detail in your message."),
});

export type SupportDto = z.infer<typeof SupportSchema>;
