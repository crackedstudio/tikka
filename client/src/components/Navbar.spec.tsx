import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Navbar from './Navbar';

vi.mock('../providers/WalletProvider', () => ({
  useWalletContext: () => ({
    isConnected: true,
    isWrongNetwork: false,
    switchNetwork: vi.fn(),
  }),
}));

vi.mock('./WalletButton', () => ({ default: () => <button data-testid="wallet-btn">Wallet</button> }));
vi.mock('./SignInButton', () => ({ default: () => <button data-testid="signin-btn">Sign In</button> }));

describe('Navbar component', () => {
  test('highlights active navigation link', () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Navbar />
      </MemoryRouter>,
    );

    const links = screen.getAllByText('Discover Raffles');
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => link.classList.contains('font-semibold'))).toBe(true);
  });

  test('renders wallet and sign in button states', () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Navbar />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('wallet-btn')).toBeInTheDocument();
    expect(screen.getByTestId('signin-btn')).toBeInTheDocument();
  });

  test('mobile hamburger expands and collapses menu', () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Navbar />
      </MemoryRouter>,
    );

    const hamburger = screen.getByRole('button', { name: /open navigation menu/i });
    expect(hamburger).toBeInTheDocument();

    fireEvent.click(hamburger);

    const closeButton = screen.getByRole('button', { name: /close navigation menu/i });
    expect(closeButton).toBeInTheDocument();

    const mobilePanel = screen.getByTestId('mobile-nav-panel');
    expect(mobilePanel).toHaveClass('max-h-screen');

    fireEvent.click(closeButton);
    expect(mobilePanel).toHaveClass('max-h-0');
  });
});
