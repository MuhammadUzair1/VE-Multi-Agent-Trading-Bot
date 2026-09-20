'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioSnapshot } from '@/lib/types';

interface PnLChartProps {
  snapshots: PortfolioSnapshot[];
}

export default function PnLChart({ snapshots }: PnLChartProps) {
  const data = snapshots.map((s) => ({
    time: new Date(s.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: s.total_value,
  }));

  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Portfolio Value</h2>
      <div className="min-h-0 flex-1">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232734" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6b7280' }} minTickGap={40} />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                width={56}
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ background: '#131722', border: '1px solid #232734', fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Line type="monotone" dataKey="value" stroke="#209dd7" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-600">
            Not enough history yet
          </div>
        )}
      </div>
    </section>
  );
}
