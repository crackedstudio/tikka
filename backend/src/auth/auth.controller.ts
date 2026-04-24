
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { Throttle } from "../middleware/throttle.decorator";
import { UsePipes } from "@nestjs/common";
import { createZodPipe } from "../api/rest/raffles/pipes/zod-validation.pipe";
import {
  GetNonceQuerySchema,
  VerifyBodySchema,
  RefreshBodySchema,
  VerifyBodyDto,
  RefreshBodyDto,
} from "./auth.schema";

@ApiTags("Authentication")
@Controller("auth")
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/nonce?address=G... — Get signing nonce for SIWS.
   *
   * Rate limit: 30 req / 60 s per IP  (nonce tier).
   * Stricter than the default tier because this endpoint is stateful
   * (each call stores a nonce in memory/DB) and could be used to
   * exhaust nonce storage if left unlimited.
   */
  @Throttle({ nonce: { limit: 30, ttl: 60000 } })
  @Get("nonce")
  @ApiOperation({ summary: "Get signing nonce for SIWS" })
  @ApiQuery({ name: "address", description: "Stellar address of the user" })
  @UsePipes(new (createZodPipe(GetNonceQuerySchema))())
  async getNonce(@Query("address") address: string) {
    return this.authService.getNonce(address);
  }

  /**
   * POST /auth/verify — Verify wallet signature, issue JWT.
   * Body: { address, signature, nonce [, issuedAt] }
   *
   * Rate limit: 10 req / 60 s per IP  (auth tier).
   * Very strict — prevents brute-force signature/nonce guessing.
   */
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post("verify")
  @ApiOperation({ summary: "Verify wallet signature and issue JWT" })
  @UsePipes(new (createZodPipe(VerifyBodySchema))())
  async verify(@Body() payload: VerifyBodyDto) {
    try {
      return await this.authService.verify(
        payload.address,
        payload.signature,
        payload.nonce,
        payload.issuedAt,
      );
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Verification failed",
      );
    }
  }

  /**
   * POST /auth/refresh — Exchange a refresh token for new tokens.
   */
  @Throttle({ auth: { limit: 30, ttl: 60000 } })
  @Post("refresh")
  @ApiOperation({ summary: "Exchange refresh token for new access + refresh tokens" })
  @UsePipes(new (createZodPipe(RefreshBodySchema))())
  async refresh(@Body() body: RefreshBodyDto) {
    try {
      return await this.authService.refresh(body.refreshToken);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Refresh failed",
      );
    }
  }
}
