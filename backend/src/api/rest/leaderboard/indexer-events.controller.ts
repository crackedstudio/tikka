import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { Public } from '../../../auth/decorators/public.decorator';
import { LeaderboardService } from './leaderboard.service';

@Injectable()
class IndexerTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = this.config.get<string>('ADMIN_TOKEN');
    if (!token || req.headers['x-admin-token'] !== token) {
      throw new UnauthorizedException('Invalid or missing admin token');
    }
    return true;
  }
}

@ApiExcludeController()
@Public()
@UseGuards(IndexerTokenGuard)
@Controller('indexer/events')
export class IndexerEventsController {
  private readonly logger = new Logger(IndexerEventsController.name);

  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Post()
  async handleEvent(@Body() body: { eventType: string }) {
    if (body?.eventType === 'RaffleFinalized') {
      this.logger.log('RaffleFinalized received — invalidating leaderboard cache');
      await this.leaderboardService.invalidateAll();
    }
    return { ok: true };
  }
}
