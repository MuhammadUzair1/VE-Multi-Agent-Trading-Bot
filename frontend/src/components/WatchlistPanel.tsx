'use client';

import { useState } from 'react';
import Sparkline from './Sparkline';
import PriceFlash from './PriceFlash';
import type { PricePoint, PriceTick } from '@/lib/types';
import { TICKER_UNIVERSE } from '@/lib/types';

interface WatchlistPanelProps {
  tickers: string[];
  prices: Record<string, PriceTick>;
  history: Record<string, PricePoint[]>;
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

export default function WatchlistPanel({
  tickers,
  prices,
  history,
  selectedTicker,
  onSelect,
  onAdd,
  onRemove,
}: WatchlistPanelProps) {
  const [pendingAdd, setPendingAdd] = useState('');
  const addable = TICKER_UNIVERSE.filter((t) => !tickers.includes(t));

  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel">
      <div className="flex items-center justify-between border-b border-base-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Watchlist</h2>
        {addable.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={pendingAdd}
              onChange={(e) => setPendingAdd(e.target.value)}
              className="rounded border border-base-border bg-base-bg px-1 py-0.5 text-xs text-gray-200"
            >
              <option value="">+ ticker</option>
              {addable.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!pendingAdd}
              onClick={() => {
                if (!pendingAdd) return;
                onAdd(pendingAdd);
                setPendingAdd('');
              }}
              className="rounded bg-accent-purple px-2 py-0.5 text-xs text-white disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-base-panel text-gray-500">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Ticker</th>
              <th className="px-2 py-1.5 text-right font-medium">Price</th>
              <th className="px-2 py-1.5 text-right font-medium">Chg %</th>
              <th className="px-2 py-1.5 text-right font-medium">Chart</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => {
              const tick = prices[ticker];
              const pts = history[ticker] ?? [];
              const isSelected = ticker === selectedTicker;
              return (
                <tr
                  key={ticker}
                  onClick={() => onSelect(ticker)}
                  className={`cursor-pointer border-t border-base-border/60 hover:bg-white/5 ${
                    isSelected ? 'bg-white/[0.06]' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-gray-100">{ticker}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-gray-200">
                    {tick ? (
                      <PriceFlash direction={tick.direction} flashKey={tick.timestamp}>
                        {tick.price.toFixed(2)}
                      </PriceFlash>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      !tick
                        ? 'text-gray-600'
                        : tick.change_percent > 0
                          ? 'text-up'
                          : tick.change_percent < 0
                            ? 'text-down'
                            : 'text-gray-400'
                    }`}
                  >
                    {tick ? `${tick.change_percent >= 0 ? '+' : ''}${tick.change_percent.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Sparkline points={pts} />
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(ticker);
                      }}
                      className="text-gray-600 hover:text-down"
                      aria-label={`Remove ${ticker} from watchlist`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
            {tickers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-600">
                  Watchlist is empty
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
