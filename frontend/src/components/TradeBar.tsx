'use client';

import { useState } from 'react';
import { TICKER_UNIVERSE } from '@/lib/types';
import type { TradeSide } from '@/lib/types';

interface TradeBarProps {
  selectedTicker: string | null;
  onTrade: (ticker: string, quantity: number, side: TradeSide) => Promise<void> | void;
  errorMessage: string | null;
}

export default function TradeBar({ selectedTicker, onTrade, errorMessage }: TradeBarProps) {
  const [ticker, setTicker] = useState(selectedTicker ?? TICKER_UNIVERSE[0]);
  const [quantity, setQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const activeTicker = selectedTicker ?? ticker;

  const submit = async (side: TradeSide) => {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return;
    setSubmitting(true);
    try {
      await onTrade(activeTicker, qty, side);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-md border border-base-border bg-base-panel p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Trade</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeTicker}
          onChange={(e) => setTicker(e.target.value)}
          disabled={!!selectedTicker}
          className="rounded border border-base-border bg-base-bg px-2 py-1 text-sm text-gray-200 disabled:opacity-70"
        >
          {TICKER_UNIVERSE.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-24 rounded border border-base-border bg-base-bg px-2 py-1 text-sm text-gray-200"
          placeholder="Qty"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('buy')}
          className="rounded bg-up px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit('sell')}
          className="rounded bg-down px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          Sell
        </button>
      </div>
      {errorMessage && <p className="mt-2 text-xs text-down">{errorMessage}</p>}
    </section>
  );
}
