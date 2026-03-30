import { z } from "zod";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

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

export class VerifyBodyDto {
  @ApiProperty({ description: "Stellar address of the user" })
  address: string;

  @ApiProperty({ description: "Wallet signature of the SIWS message" })
  signature: string;

  @ApiProperty({ description: "Nonce obtained from /auth/nonce" })
  nonce: string;

  @ApiPropertyOptional({ description: "Timestamp the signature was issued" })
  issuedAt?: string;
}
