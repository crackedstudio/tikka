import { z } from "zod";

export const UpsertMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  metadata_cid: z.string().nullable().optional(),
});

export type UpsertMetadataDto = z.infer<typeof UpsertMetadataSchema>;
