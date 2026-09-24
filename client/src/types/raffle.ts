export * from "@tikka/types/raffle";

/** Formatted raffle object used by UI components */
export interface FormattedRaffle {
  id: number;
  creator: string;
  title?: string;
  status: string;
  description: string;
  endTime: number;
  maxTickets: number;
  allowMultipleTickets: boolean;
  ticketPrice: string;
  ticketToken: string | undefined;
  totalTicketsSold: number;
  winner: string | null;
  winningTicketId: number;
  isActive: boolean;
  isFinalized: boolean;
  winningsWithdrawn: boolean;
  countdown: {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  };
  progress: number;
  entries: number;
  ticketPriceFormatted: string;
  prizeValue: string;
  prizeCurrency: string;
  buttonText: string;
  image: string;
  metadata: {
    title: string;
    description: string;
    image: string;
    images?: string[];
    prizeName: string;
    prizeValue: string;
    prizeCurrency: string;
    category: string;
    tags: string[];
    createdBy: string;
    createdAt: number;
    updatedAt: number;
  };
}
