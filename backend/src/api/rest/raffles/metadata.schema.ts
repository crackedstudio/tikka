import { z } from "zod";
import { ApiPropertyOptional } from "@nestjs/swagger";

export const UpsertMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().nullable().optional(),
  image_urls: z.array(z.string()).nullable().optional(),
  category: z.string().nullable().optional(),
  metadata_cid: z.string().nullable().optional(),
});

export class UpsertMetadataDto {
  @ApiPropertyOptional({ description: "Title of the raffle" })
  title?: string;

  @ApiPropertyOptional({ description: "Description text" })
  description?: string;

  @ApiPropertyOptional({ description: "Primary image URL" })
  image_url?: string;

  @ApiPropertyOptional({ description: "Additional image URLs", type: [String] })
  image_urls?: string[];

  @ApiPropertyOptional({ description: "Category name" })
  category?: string;

  @ApiPropertyOptional({ description: "IPFS CID for metadata" })
  metadata_cid?: string;
}
