import { useState } from 'react';

interface AdminLoginProps {
  onLogin: () => void;
}

const AdminLogin = ({ onLogin }: AdminLoginProps) => {
  const [token, setToken] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    sessionStorage.setItem('admin_token', token.trim());
    onLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0A1E]">
      <div className="w-full max-w-sm rounded-xl border border-[#2A264A] bg-[#15102A] p-8">
        <h1 className="mb-6 text-center text-2xl font-bold text-white">
          Oracle Admin Dashboard
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="admin-token" className="text-sm text-gray-400">
              Admin Token
            </label>
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter admin token"
              className="rounded-lg border border-[#2A264A] bg-[#0D0A1E] px-4 py-2 text-white placeholder-gray-600 outline-none focus:border-[#5B4FCF] focus:ring-1 focus:ring-[#5B4FCF]"
            />
          </div>
          <button
            type="submit"
            disabled={!token.trim()}
            className="rounded-lg bg-[#5B4FCF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6B5FDF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
