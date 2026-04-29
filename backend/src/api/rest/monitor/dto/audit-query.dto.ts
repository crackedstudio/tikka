import { z } from "zod";

export const AuditQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .refine(
    (value) => {
      if (!value.from || !value.to) {
        return true;
      }

      return new Date(value.from).getTime() <= new Date(value.to).getTime();
    },
    {
      path: ["from"],
      message: "from must be before to",
    },
  );

export type AuditQueryDto = z.infer<typeof AuditQuerySchema>;
