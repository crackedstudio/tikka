import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { verifyProof, VerifyInput, VerifyResult } from './verify';

@Controller('verify-proof')
export class VerifyController {
  /**
   * POST /verify-proof
   * Body: { key, input, proof, seed, method?, raffleId? }
   * Returns: VerifyResult
   */
  @Post()
  @HttpCode(200)
  verify(@Body() body: VerifyInput): VerifyResult {
    return verifyProof(body);
  }
}
