import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/**
 * Optional internal-only API key guard.
 * Activated when the INTERNAL_API_KEY env var is set.
 * Clients must send:  x-api-key: <INTERNAL_API_KEY>
 * When the env var is absent the guard is a no-op (open access).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("INTERNAL_API_KEY");
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) return true; // guard disabled — no key configured

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers["x-api-key"];

    if (provided !== this.apiKey) {
      throw new UnauthorizedException("Invalid or missing API key");
    }

    return true;
  }
}
