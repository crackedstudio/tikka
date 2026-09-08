import { z } from "zod";

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

/**
 * Structured asset descriptor for ticket pricing.
 * Note: Asset validation (isAllowedTicketAsset) is environment-specific
 * and should be applied at the application layer, not in this shared schema.
 */
export const AssetSchema = z.object({
  /** Asset code, e.g. "XLM", "USDC", "yXLM" */
  code: z
    .string()
    .min(1)
    .max(12),
  /** Issuer account for non-native assets. Required for all assets except XLM. */
  issuer: z.string().optional(),
});

export type AssetDto = z.infer<typeof AssetSchema>;

/**
 * Shared raffle metadata schema.
 * Used by both client and backend for consistent validation.
 */
export const RaffleMetadataSchema = z.object({
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
  /** Asset used for ticket pricing. */
  asset: AssetSchema.optional(),
});

export type RaffleMetadata = z.infer<typeof RaffleMetadataSchema>;
