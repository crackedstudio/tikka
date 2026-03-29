import { Injectable, Logger } from "@nestjs/common";
import { SupportDto } from "./dto/support.dto";

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  async submitTicket(payload: SupportDto): Promise<{ success: true }> {
    this.logger.log("Received support ticket", payload);
    // TODO: Integrate with real email or ticketing system (SendGrid / SES / Zendesk)
    return { success: true };
  }
}
