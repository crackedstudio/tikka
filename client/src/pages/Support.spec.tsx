import { render, fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import Support from './Support';

vi.mock('../services/supportService', () => ({
  sendSupportTicket: vi.fn(() => Promise.resolve()),
}));

describe('Support page', () => {
  test('submits form and shows success message', async () => {
    render(<Support />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: 'Test issue' } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Please help me with a ticket.' } });

    fireEvent.click(screen.getByRole('button', { name: /send support request/i }));

    expect(await screen.findByText(/support request sent/i)).toBeInTheDocument();
  });
});
