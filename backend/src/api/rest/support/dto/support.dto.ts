import { z } from "zod";

export const SupportSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80, "Please keep your name under 80 characters."),
  email: z.string().trim().email("Please enter a valid email address.").max(254, "Please keep your email address under 254 characters."),
  subject: z.string().trim().min(5, "Please enter a short subject.").max(120, "Please keep your subject under 120 characters."),
  message: z.string().trim().min(10, "Please provide more detail in your message.").max(4000, "Your message is too long. Please keep it under 4000 characters."),
});

export type SupportDto = z.infer<typeof SupportSchema>;
