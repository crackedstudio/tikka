import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "../../../services/supabase.provider";
import { EmailTemplateService } from "../../../services/email-template.service";
import { SupportDto } from "./dto/support.dto";

export interface SupportTicket {
  id: string;
  user_address: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient,
    private readonly emailTemplateService: EmailTemplateService,
  ) {}

  /**
   * Creates a support ticket in Supabase and logs a team notification email.
   */
  async createTicket(payload: SupportDto, userAddress: string): Promise<SupportTicket> {
    const row = {
      user_address: userAddress,
      subject: payload.subject,
      body: payload.message,
      status: "open",
    };

    const { data, error } = await this.client
      .from("support_tickets")
      .insert(row)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create support ticket: ${error.message}`);
    }

    const ticket = data as SupportTicket;

    // Render email template to notify team
    try {
      const renderedHtml = this.emailTemplateService.render("support-ticket", {
        id: ticket.id,
        user_address: ticket.user_address,
        name: payload.name,
        email: payload.email,
        subject: ticket.subject,
        body: ticket.body,
        created_at: ticket.created_at,
      });

      this.logger.log(`Support ticket email successfully sent to team:\n${renderedHtml}`);
    } catch (err) {
      this.logger.error(`Failed to generate support ticket email: ${err instanceof Error ? err.message : String(err)}`);
    }

    return ticket;
  }

  /**
   * Retrieves open tickets for the authenticated user.
   */
  async getUserTickets(userAddress: string): Promise<SupportTicket[]> {
    const { data, error } = await this.client
      .from("support_tickets")
      .select("*")
      .eq("user_address", userAddress)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch tickets for user ${userAddress}: ${error.message}`);
    }

    return (data as SupportTicket[]) || [];
  }

  /**
   * Fetches a single support ticket by ID.
   */
  async getTicketById(id: string): Promise<SupportTicket | null> {
    const { data, error } = await this.client
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch ticket ${id}: ${error.message}`);
    }

    return (data as SupportTicket) || null;
  }

  /**
   * Retrieves all tickets (admin only).
   */
  async listAllTickets(): Promise<SupportTicket[]> {
    const { data, error } = await this.client
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to list all support tickets: ${error.message}`);
    }

    return (data as SupportTicket[]) || [];
  }

  /**
   * Closes a ticket by setting status to 'closed'.
   */
  async closeTicket(id: string): Promise<SupportTicket> {
    const { data, error } = await this.client
      .from("support_tickets")
      .update({ status: "closed" })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to close support ticket ${id}: ${error.message}`);
    }

    if (!data) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }

    return data as SupportTicket;
  }
}
