import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupportDto } from "./dto/support.dto";

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly recentSubmissions = new Map<string, number>();

  async createTicket(payload: SupportDto, userAddress: string): Promise<{ success: true }> {
    const duplicateKey = this.getDuplicateKey(payload);
    const now = Date.now();
    const previousSubmissionAt = this.recentSubmissions.get(duplicateKey);

    if (previousSubmissionAt && now - previousSubmissionAt < 15 * 60 * 1000) {
      throw new BadRequestException({
        message: "A similar support request was submitted recently. Please wait a moment before sending another.",
      });
    }

    this.recentSubmissions.set(duplicateKey, now);
    this.logger.log(`Received support ticket for ${userAddress}`, payload);
    // TODO: Integrate with real email or ticketing system (SendGrid / SES / Zendesk)
    return { success: true };
  }

  async submitTicket(payload: SupportDto): Promise<{ success: true }> {
    return this.createTicket(payload, "unknown");
  }

  private getDuplicateKey(payload: SupportDto): string {
    const normalizedMessage = payload.message.trim().toLowerCase().replace(/\s+/g, " ");
    return `${payload.email.toLowerCase()}:${payload.subject.trim().toLowerCase()}:${normalizedMessage}`;
  }
}
