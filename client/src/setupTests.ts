import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      // Return a human-readable version of the key for testing
      if (key === 'navbar.discover') return 'Discover Raffles';
      if (key === 'navbar.create') return 'Create Raffle';
      if (key === 'navbar.myRaffles') return 'My Raffles';
      if (key === 'navbar.leaderboard') return 'Leaderboard';
      if (key === 'navbar.settings') return 'Settings';
      if (key === 'navbar.getStarted') return 'Get Started';
      if (key === 'navbar.searchPlaceholder') return 'Search raffles...';
      return key;
    },
    i18n: {
      changeLanguage: vi.fn(),
      language: 'en',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}));

// jsdom does not implement window.matchMedia — provide a minimal stub
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
