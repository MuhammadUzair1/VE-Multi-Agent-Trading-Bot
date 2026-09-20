'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PriceFlash from './PriceFlash';
import type { PricePoint, PriceTick } from '@/lib/types';

interface MainChartProps {
  ticker: string | null;
  points: PricePoint[];
  tick: PriceTick | undefined;
}

export default function MainChart({ ticker, points, tick }: MainChartProps) {
  const data = points.map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    price: p.price,
  }));
  const isUp = tick ? tick.direction !== 'down' : true;
  const strokeColor = isUp ? '#26a65b' : '#e5484d';

  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-mono text-lg font-bold text-gray-100">{ticker ?? 'Select a ticker'}</h2>
        {tick && (
          <div className="flex items-baseline gap-2 font-mono">
            <PriceFlash direction={tick.direction} flashKey={tick.timestamp} className="text-xl font-semibold">
              {tick.price.toFixed(2)}
            </PriceFlash>
            <span className={tick.change_percent >= 0 ? 'text-up' : 'text-down'}>
              {tick.change_percent >= 0 ? '+' : ''}
              {tick.change_percent.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#232734" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6b7280' }} minTickGap={40} />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                width={56}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip
                contentStyle={{ background: '#131722', border: '1px solid #232734', fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Area type="monotone" dataKey="price" stroke={strokeColor} fill="url(#chartFill)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-600">
            {ticker ? 'Waiting for price data…' : 'Click a ticker in the watchlist to view its chart'}
          </div>
        )}
      </div>
    </section>
  );
}
