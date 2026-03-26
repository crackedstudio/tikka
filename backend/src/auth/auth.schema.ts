import { z } from "zod";

export const GetNonceQuerySchema = z.object({
  address: z
    .string({ required_error: "address is required" })
    .min(1, "address cannot be empty"),
});

export const VerifyBodySchema = z.object({
  address: z
    .string({ required_error: "address is required" })
    .min(1, "address cannot be empty"),
  signature: z
    .string({ required_error: "signature is required" })
    .min(1, "signature cannot be empty"),
  nonce: z
    .string({ required_error: "nonce is required" })
    .min(1, "nonce cannot be empty"),
  issuedAt: z.string().optional(),
});

export type VerifyBodyDto = z.infer<typeof VerifyBodySchema>;
