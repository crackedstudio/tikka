import { z } from "zod";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { isAllowedTicketAsset, resolveAllowedTicketAssets } from "../../../config/stellar.constants";
import {
  RaffleMetadataSchema,
  AssetSchema as BaseAssetSchema,
  AssetDto,
  METADATA_TITLE_MAX,
  METADATA_DESCRIPTION_MAX,
  METADATA_CATEGORY_MAX,
  METADATA_CID_MAX,
  METADATA_IMAGE_URL_MAX,
  METADATA_IMAGE_URLS_MAX_COUNT,
} from "@tikka/sdk/dist/schemas/raffle-metadata.schema";

// Re-export constants for backward compatibility
export {
  METADATA_TITLE_MAX,
  METADATA_DESCRIPTION_MAX,
  METADATA_CATEGORY_MAX,
  METADATA_CID_MAX,
  METADATA_IMAGE_URL_MAX,
  METADATA_IMAGE_URLS_MAX_COUNT,
  AssetDto,
};

/**
 * Backend-specific AssetSchema with environment-specific validation.
 * Extends the base schema with allowed asset checking.
 */
export const AssetSchema = BaseAssetSchema.extend({
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
});

/**
 * Backend-specific UpsertMetadataSchema with asset validation.
 * Uses the shared RaffleMetadataSchema as a base and overrides asset field.
 */
export const UpsertMetadataSchema = RaffleMetadataSchema.extend({
  asset: AssetSchema.optional(),
});

export class UpsertMetadataDto {
  @ApiPropertyOptional({
    description: "Title of the raffle",
    maxLength: METADATA_TITLE_MAX,
  })
  title?: string;

  @ApiPropertyOptional({
    description: "Description text",
    maxLength: METADATA_DESCRIPTION_MAX,
  })
  description?: string;

  @ApiPropertyOptional({
    description: "Primary image URL (http or https only)",
    maxLength: METADATA_IMAGE_URL_MAX,
    format: "uri",
  })
  image_url?: string;

  @ApiPropertyOptional({
    description: `Additional image URLs (http or https only, max ${METADATA_IMAGE_URLS_MAX_COUNT})`,
    type: [String],
    maxItems: METADATA_IMAGE_URLS_MAX_COUNT,
  })
  image_urls?: string[];

  @ApiPropertyOptional({
    description: "Category name",
    maxLength: METADATA_CATEGORY_MAX,
  })
  category?: string;

  @ApiPropertyOptional({
    description: "IPFS CID for metadata",
    maxLength: METADATA_CID_MAX,
  })
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
