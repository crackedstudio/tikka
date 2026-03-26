export interface TrendingTabProps {
    changeActiveTab: (tab: string) => void;
    activeTab: string;
}

// Raffle Creation Types
export interface RaffleFormData {
    title: string;
    description: string;
    image: File | null;
    pricePerTicket: number;
    totalTickets: number;
    duration: {
        days: number;
        hours: number;
    };
}

export interface CreateRaffleStep {
    id: string;
    title: string;
    icon: string;
    completed: boolean;
    active: boolean;
}

export interface ProgressStepperProps {
    steps: CreateRaffleStep[];
    currentStep: number;
}

export interface StepComponentProps {
    formData: RaffleFormData;
    updateFormData: (data: Partial<RaffleFormData>) => void;
    onNext: () => void;
    onBack: () => void;
}

export interface LivePreviewProps {
    formData: RaffleFormData;
}

// Leaderboard Types
export interface Player {
    id: string;
    name: string;
    rank: number;
    wins: number;
    xpWon: number;
    avatar?: string;
    badges?: Badge[];
}

export interface Badge {
    id: string;
    name: string;
    icon: string;
    color: string;
}

export interface TopPlayer {
    id: string;
    name: string;
    rank: number;
    xp: number;
    avatar?: string;
    color: string;
}

export interface PlayerStats {
    name: string;
    joinedDate: string;
    tickets: number;
    wins: number;
    level: number;
    currentXp: number;
    nextLevelXp: number;
    dailyStreak: number;
    streakDays: boolean[];
}

export interface Achievement {
    id: string;
    name: string;
    icon: string;
    color: string;
}

export interface LeaderboardTab {
    id: string;
    label: string;
    active: boolean;
}

export interface LeaderboardProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

// Winner Announcement Types
export interface WinnerAnnouncementProps {
    onClose: () => void;
    onClaimPrize?: () => void;
    onBackToHome?: () => void;
    prizeName?: string;
    prizeValue?: string;
    walletAddress?: string;
    isVisible?: boolean;
}

export interface SocialPlatform {
    id: string;
    name: string;
    icon: string;
    color: string;
    url: string;
}

export interface WalletInfo {
    address: string;
    type: string;
    isConnected: boolean;
}

// Raffle Metadata Types
export interface RaffleMetadata {
    title: string;
    description: string;
    image: string; // IPFS URL or Supabase storage URL
    prizeName: string;
    prizeValue: string;
    prizeCurrency: string;
    category: string;
    tags: string[];
    createdBy: string; // Wallet address
    createdAt: number; // Timestamp
    updatedAt: number; // Timestamp
}

export interface SupabaseRaffleRecord {
    id: string;
    raffle_id: number; // Contract raffle ID
    metadata: RaffleMetadata;
    created_at: string;
    updated_at: string;
}

// ============================================
// CONTRACT TYPES
// ============================================

/**
 * Contract raffle data structure returned from smart contract
 */
export interface ContractRaffleData {
    id: number;
    creator: string; // Stellar address
    metadataId: string; // Supabase record ID
    ticketPrice: string; // Price in stroops (string to handle large numbers)
    totalTickets: number;
    ticketsSold: number;
    endTime: number; // Unix timestamp
    isActive: boolean;
    winner?: string; // Stellar address of winner (if drawn)
    prizeDistributed: boolean;
}

/**
 * User participation data for a specific raffle
 */
export interface ContractUserParticipation {
    raffleId: number;
    userAddress: string;
    ticketsPurchased: number;
    totalSpent: string; // Amount in stroops
    participationTime: number; // Unix timestamp
}

/**
 * Parameters for creating a new raffle
 */
export interface CreateRaffleParams {
    metadataId: string; // Supabase record ID containing off-chain data
    ticketPrice: string; // Price per ticket in stroops
    totalTickets: number;
    durationInSeconds: number;
}

/**
 * Parameters for buying tickets
 */
export interface BuyTicketParams {
    raffleId: number;
    ticketCount: number;
    maxPricePerTicket: string; // Maximum price willing to pay (slippage protection)
}

/**
 * Contract function response wrapper
 */
export interface ContractResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    transactionHash?: string;
}

/**
 * Contract error types
 */
export const ContractErrorType = {
    NETWORK_ERROR: "NETWORK_ERROR",
    CONTRACT_ERROR: "CONTRACT_ERROR", 
    WALLET_ERROR: "WALLET_ERROR",
    VALIDATION_ERROR: "VALIDATION_ERROR",
    INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
    RAFFLE_NOT_FOUND: "RAFFLE_NOT_FOUND",
    RAFFLE_ENDED: "RAFFLE_ENDED",
    RAFFLE_FULL: "RAFFLE_FULL",
    UNAUTHORIZED: "UNAUTHORIZED",
    UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ContractErrorType = typeof ContractErrorType[keyof typeof ContractErrorType];

/**
 * Contract error details
 */
export interface ContractError {
    type: ContractErrorType;
    message: string;
    details?: unknown;
    transactionHash?: string;
}

/**
 * Transaction status for contract operations
 */
export interface ContractTransactionStatus {
    hash: string;
    status: "pending" | "success" | "failed";
    timestamp: number;
    operation: string;
    error?: ContractError;
}

/**
 * Contract event data structures
 */
export interface RaffleCreatedEvent {
    raffleId: number;
    creator: string;
    metadataId: string;
    ticketPrice: string;
    totalTickets: number;
    endTime: number;
}

export interface TicketPurchasedEvent {
    raffleId: number;
    buyer: string;
    ticketCount: number;
    totalCost: string;
    ticketsSoldTotal: number;
}

export interface RaffleEndedEvent {
    raffleId: number;
    winner: string;
    totalTicketsSold: number;
    prizeAmount: string;
}

// ============================================
// BACKEND API RESPONSE TYPES
// ============================================

/** Raffle list item from GET /raffles (indexer contract data, snake_case) */
export interface ApiRaffleListItem {
    id: number;
    creator: string;
    status: string;
    ticket_price: string;
    asset: string;
    max_tickets: number;
    tickets_sold: number;
    end_time: string;
    winner: string | null;
    prize_amount: string | null;
    created_ledger: number;
    finalized_ledger: number | null;
    metadata_cid: string | null;
    created_at: string;
    participant_count?: number;
}

/** Response from GET /raffles */
export interface ApiRaffleListResponse {
    raffles: ApiRaffleListItem[];
    total?: number;
}

/** Raffle detail from GET /raffles/:id (contract data + off-chain metadata merged) */
export interface ApiRaffleDetail extends ApiRaffleListItem {
    title?: string;
    description?: string;
    image_url?: string | null;
    category?: string | null;
}

/** Query filters for GET /raffles */
export interface RaffleListFilters {
    status?: string;
    category?: string;
    creator?: string;
    asset?: string;
    limit?: number;
    offset?: number;
}

/** Formatted raffle object used by UI components */
export interface FormattedRaffle {
    id: number;
    creator: string;
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

// ============================================
// NOTIFICATION TYPES
// ============================================

export type NotificationChannel = 'email' | 'push';

export interface NotificationSubscription {
    id: string;
    raffleId: number;
    userAddress: string;
    channel: NotificationChannel;
    createdAt: string;
}

export interface NotificationPreferences {
    raffleEnd: boolean;
    winNotification: boolean;
    channel: NotificationChannel;
}
