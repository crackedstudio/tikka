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
