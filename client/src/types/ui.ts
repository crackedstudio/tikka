export interface TrendingTabProps {
  changeActiveTab: (tab: string) => void;
  activeTab: string;
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
