import { z } from "zod";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { isAllowedTicketAsset, resolveAllowedTicketAssets } from "../../../config/stellar.constants";

/** Structured asset descriptor for ticket pricing. */
export const AssetSchema = z.object({
  /** Asset code, e.g. "XLM", "USDC", "yXLM" */
  code: z
    .string()
    .min(1)
    .max(12)
    .refine(
      (code) => isAllowedTicketAsset(code),
      (code) => ({
        message: `Asset "${code}" is not allowed. Accepted: ${resolveAllowedTicketAssets().join(", ")}`,
      }),
    ),
  /** Issuer account for non-native assets. Required for all assets except XLM. */
  issuer: z.string().optional(),
});

export type AssetDto = z.infer<typeof AssetSchema>;

export const UpsertMetadataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().nullable().optional(),
  image_urls: z.array(z.string()).nullable().optional(),
  category: z.string().nullable().optional(),
  metadata_cid: z.string().nullable().optional(),
  /** Asset used for ticket pricing. When provided, code must be on the whitelist. */
  asset: AssetSchema.optional(),
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

  @ApiPropertyOptional({
    description: "Asset used for ticket pricing (code must be whitelisted)",
    type: "object",
    properties: {
      code: { type: "string", example: "USDC" },
      issuer: { type: "string", example: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    },
  })
  asset?: AssetDto;
}
