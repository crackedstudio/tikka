import { Test, TestingModule } from '@nestjs/testing';
import { SupportService, SupportTicket } from './support.service';
import { SUPABASE_CLIENT } from '../../../services/supabase.provider';
import { EmailTemplateService } from '../../../services/email-template.service';
import { NotFoundException } from '@nestjs/common';

const mockTicket: SupportTicket = {
  id: 'ticket-uuid-123',
  user_address: 'GABC123',
  subject: 'Stuck Randomness',
  body: 'My raffle has been pending for hours.',
  status: 'open',
  created_at: '2026-06-27T08:00:00Z',
};

describe('SupportService', () => {
  let service: SupportService;
  let emailTemplateService: jest.Mocked<Pick<EmailTemplateService, 'render'>>;
  let queryBuilder: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    eq: jest.Mock;
    order: jest.Mock;
    single: jest.Mock;
    maybeSingle: jest.Mock;
  };
  let client: { from: jest.Mock };

  beforeEach(async () => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    };

    client = {
      from: jest.fn().mockReturnValue(queryBuilder),
    };

    emailTemplateService = {
      render: jest.fn().mockReturnValue('<h1>Rendered Ticket</h1>'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: SUPABASE_CLIENT, useValue: client },
        { provide: EmailTemplateService, useValue: emailTemplateService },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('creates a ticket and sends an email notification to the team', async () => {
      const payload = {
        name: 'John Doe',
        email: 'john@example.com',
        subject: 'Stuck Randomness',
        message: 'My raffle has been pending for hours.',
      };

      queryBuilder.single.mockResolvedValue({ data: mockTicket, error: null });

      const result = await service.createTicket(payload, 'GABC123');

      expect(client.from).toHaveBeenCalledWith('support_tickets');
      expect(queryBuilder.insert).toHaveBeenCalledWith({
        user_address: 'GABC123',
        subject: payload.subject,
        body: payload.message,
        status: 'open',
      });
      expect(emailTemplateService.render).toHaveBeenCalledWith(
        'support-ticket',
        expect.objectContaining({
          id: 'ticket-uuid-123',
          user_address: 'GABC123',
          name: 'John Doe',
          email: 'john@example.com',
          subject: 'Stuck Randomness',
          body: 'My raffle has been pending for hours.',
        })
      );
      expect(result).toEqual(mockTicket);
    });

    it('throws an error if ticket creation fails in database', async () => {
      queryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        service.createTicket(
          {
            name: 'John',
            email: 'john@a.com',
            subject: 'x',
            message: 'details_details',
          },
          'GABC123'
        )
      ).rejects.toThrow('Failed to create support ticket: Database error');
    });
  });

  describe('getUserTickets', () => {
    it('fetches only open tickets for the specified user address', async () => {
      const mockTickets = [mockTicket];
      queryBuilder.order.mockResolvedValue({ data: mockTickets, error: null });

      const result = await service.getUserTickets('GABC123');

      expect(client.from).toHaveBeenCalledWith('support_tickets');
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(1, 'user_address', 'GABC123');
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(2, 'status', 'open');
      expect(result).toEqual(mockTickets);
    });
  });

  describe('getTicketById', () => {
    it('returns the ticket if found', async () => {
      queryBuilder.maybeSingle.mockResolvedValue({ data: mockTicket, error: null });

      const result = await service.getTicketById('ticket-uuid-123');

      expect(client.from).toHaveBeenCalledWith('support_tickets');
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'ticket-uuid-123');
      expect(result).toEqual(mockTicket);
    });

    it('returns null if ticket is not found', async () => {
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await service.getTicketById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listAllTickets', () => {
    it('lists all support tickets in the database', async () => {
      const mockTickets = [mockTicket];
      queryBuilder.order.mockResolvedValue({ data: mockTickets, error: null });

      const result = await service.listAllTickets();

      expect(client.from).toHaveBeenCalledWith('support_tickets');
      expect(result).toEqual(mockTickets);
    });
  });

  describe('closeTicket', () => {
    it('updates ticket status to closed and returns the updated record', async () => {
      const closedTicket = { ...mockTicket, status: 'closed' };
      queryBuilder.maybeSingle.mockResolvedValue({ data: closedTicket, error: null });

      const result = await service.closeTicket('ticket-uuid-123');

      expect(client.from).toHaveBeenCalledWith('support_tickets');
      expect(queryBuilder.update).toHaveBeenCalledWith({ status: 'closed' });
      expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'ticket-uuid-123');
      expect(result.status).toBe('closed');
    });

    it('throws NotFoundException if ticket does not exist to close', async () => {
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

      await expect(service.closeTicket('non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
