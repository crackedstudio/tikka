import { useState } from 'react';
import type { ErrorRecord } from '../../services/monitorApi';

interface ErrorTableProps {
  errors: ErrorRecord[];
}

const ErrorTable = ({ errors }: ErrorTableProps) => {
  const [filter, setFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const filtered = filter
    ? errors.filter((e) =>
        e.errorMessage.toLowerCase().includes(filter.toLowerCase()),
      )
    : errors;

  const toggleRow = (jobId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="Filter by error message…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border border-[#2A264A] bg-[#15102A] px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No errors</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#2A264A]">
          <table className="w-full text-sm text-gray-300">
            <thead>
              <tr className="border-b border-[#2A264A] bg-[#15102A] text-left text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Job ID</th>
                <th className="px-4 py-3">Failed At</th>
                <th className="px-4 py-3">Error Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((error) => {
                const isExpanded = expandedRows.has(error.jobId);
                return (
                  <>
                    <tr
                      key={error.jobId}
                      onClick={() => toggleRow(error.jobId)}
                      className="cursor-pointer border-b border-[#2A264A] bg-[#0E0A1F] transition-colors hover:bg-[#15102A]"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-purple-300">
                        {error.jobId}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(error.failedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-red-400">{error.errorMessage}</td>
                    </tr>
                    {isExpanded && (
                      <tr
                        key={`${error.jobId}-xdr`}
                        className="border-b border-[#2A264A] bg-[#0A0718]"
                      >
                        <td colSpan={3} className="px-4 py-3">
                          <pre className="overflow-x-auto rounded-lg bg-[#15102A] p-3 font-mono text-xs text-gray-300">
                            {error.xdr || '(no XDR)'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ErrorTable;
