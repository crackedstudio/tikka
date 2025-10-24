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
