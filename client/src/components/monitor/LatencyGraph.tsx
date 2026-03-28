import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { LatencyPoint } from '../../services/monitorApi';

interface LatencyGraphProps {
  latencyData: LatencyPoint[];
  onRangeChange: (from: string, to: string) => void;
}

type RangeKey = '1h' | '6h' | '24h' | '7d';

const RANGES: { label: RangeKey; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function LatencyGraph({ latencyData, onRangeChange }: LatencyGraphProps) {
  const [activeRange, setActiveRange] = useState<RangeKey>('1h');

  function handleRangeClick(range: { label: RangeKey; hours: number }) {
    setActiveRange(range.label);
    const to = new Date();
    const from = new Date(to.getTime() - range.hours * 60 * 60 * 1000);
    onRangeChange(from.toISOString(), to.toISOString());
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-lg font-semibold">Latency</h2>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range.label}
              onClick={() => handleRangeClick(range)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeRange === range.label
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {latencyData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400">
          No data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={latencyData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="enqueuedAt"
              tickFormatter={formatTime}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              stroke="#4B5563"
            />
            <YAxis
              dataKey="latencyMs"
              label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }}
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              stroke="#4B5563"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '6px' }}
              labelStyle={{ color: '#D1D5DB' }}
              itemStyle={{ color: '#A5B4FC' }}
              labelFormatter={(label: string) => formatTime(label)}
              formatter={(value: number) => [`${value} ms`, 'Latency']}
            />
            <Line
              type="monotone"
              dataKey="latencyMs"
              stroke="#5B4FCF"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#5B4FCF' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
