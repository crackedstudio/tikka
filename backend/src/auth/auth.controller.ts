import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * GET /auth/nonce?address=G... — Get signing nonce for SIWS.
   */
  @Get('nonce')
  async getNonce(@Query('address') address?: string) {
    if (!address) {
      throw new BadRequestException('address is required');
    }
    return this.authService.getNonce(address);
  }

  /**
   * POST /auth/verify — Verify wallet signature, issue JWT.
   * Body: { address, signature, nonce [, issuedAt] }
   */
  @Post('verify')
  async verify(
    @Body('address') address?: string,
    @Body('signature') signature?: string,
    @Body('nonce') nonce?: string,
    @Body('issuedAt') issuedAt?: string,
  ) {
    if (!address || !signature || !nonce) {
      throw new BadRequestException('address, signature, and nonce are required');
    }
    try {
      return await this.authService.verify(
        address,
        signature,
        nonce,
        issuedAt,
      );
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Verification failed',
      );
    }
  }
}
