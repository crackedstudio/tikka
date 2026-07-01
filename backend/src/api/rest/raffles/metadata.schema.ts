import { z } from "zod";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { isAllowedTicketAsset, resolveAllowedTicketAssets } from "../../../config/stellar.constants";

export const METADATA_TITLE_MAX = 200;
export const METADATA_DESCRIPTION_MAX = 2000;
export const METADATA_CATEGORY_MAX = 100;
export const METADATA_CID_MAX = 128;
export const METADATA_IMAGE_URL_MAX = 2048;
export const METADATA_IMAGE_URLS_MAX_COUNT = 10;

/** Validates that a string is a safe http/https URL (rejects javascript:, data:, etc.). */
const SafeHttpUrlSchema = z
  .string()
  .max(METADATA_IMAGE_URL_MAX, `URL must not exceed ${METADATA_IMAGE_URL_MAX} characters`)
  .refine(
    (url) => {
      try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    "Must be a valid http or https URL",
  );

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
  title: z
    .string()
    .max(METADATA_TITLE_MAX, `title must not exceed ${METADATA_TITLE_MAX} characters`)
    .optional(),
  description: z
    .string()
    .max(METADATA_DESCRIPTION_MAX, `description must not exceed ${METADATA_DESCRIPTION_MAX} characters`)
    .optional(),
  image_url: SafeHttpUrlSchema.nullable().optional(),
  image_urls: z
    .array(SafeHttpUrlSchema)
    .max(METADATA_IMAGE_URLS_MAX_COUNT, `image_urls must not contain more than ${METADATA_IMAGE_URLS_MAX_COUNT} entries`)
    .nullable()
    .optional(),
  category: z
    .string()
    .max(METADATA_CATEGORY_MAX, `category must not exceed ${METADATA_CATEGORY_MAX} characters`)
    .nullable()
    .optional(),
  metadata_cid: z
    .string()
    .max(METADATA_CID_MAX, `metadata_cid must not exceed ${METADATA_CID_MAX} characters`)
    .nullable()
    .optional(),
  /** Asset used for ticket pricing. When provided, code must be on the whitelist. */
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
