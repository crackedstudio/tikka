import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AdminLogin from './AdminLogin';

describe('AdminLogin Component', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders the admin login title and input field', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);

    expect(screen.getByText('Oracle Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin Token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('disables the submit button when token is empty or whitespace', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    expect(submitBtn).toBeDisabled();

    const input = screen.getByLabelText('Admin Token');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submitBtn).toBeDisabled();
  });

  it('saves admin token in sessionStorage and calls onLogin on form submission', () => {
    render(<AdminLogin onLogin={mockOnLogin} />);

    const input = screen.getByLabelText('Admin Token');
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(input, { target: { value: 'secret-admin-123' } });
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);

    expect(sessionStorage.getItem('admin_token')).toBe('secret-admin-123');
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
  });
});
