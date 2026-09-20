'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectionState, Direction, PricePoint, PriceTick } from './types';

const HISTORY_LIMIT = 100;

export interface PriceStreamState {
  prices: Record<string, PriceTick>;
  history: Record<string, PricePoint[]>;
  connectionState: ConnectionState;
  seedHistory: (ticker: string, points: PricePoint[]) => void;
}

function parseTick(raw: unknown): PriceTick | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.ticker !== 'string' || typeof data.price !== 'number') return null;
  return {
    ticker: data.ticker,
    price: data.price,
    prev_price: typeof data.prev_price === 'number' ? data.prev_price : data.price,
    change: typeof data.change === 'number' ? data.change : 0,
    change_percent: typeof data.change_percent === 'number' ? data.change_percent : 0,
    direction: (data.direction as Direction) ?? 'flat',
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
  };
}

export function usePriceStream(): PriceStreamState {
  const [prices, setPrices] = useState<Record<string, PriceTick>>({});
  const [history, setHistory] = useState<Record<string, PricePoint[]>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let source: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      source = new EventSource('/api/stream/prices');

      source.onopen = () => {
        hasConnectedOnce.current = true;
        setConnectionState('connected');
      };

      source.onmessage = (event: MessageEvent<string>) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const tick = parseTick(parsed);
        if (!tick) return;

        setPrices((prev) => ({ ...prev, [tick.ticker]: tick }));
        setHistory((prev) => {
          const existing = prev[tick.ticker] ?? [];
          const next = [...existing, { ticker: tick.ticker, price: tick.price, timestamp: tick.timestamp }];
          if (next.length > HISTORY_LIMIT) next.shift();
          return { ...prev, [tick.ticker]: next };
        });
      };

      source.onerror = () => {
        setConnectionState(hasConnectedOnce.current ? 'reconnecting' : 'disconnected');
      };
    };

    connect();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  const seedHistory = (ticker: string, points: PricePoint[]) => {
    setHistory((prev) => (prev[ticker]?.length ? prev : { ...prev, [ticker]: points }));
  };

  return { prices, history, connectionState, seedHistory };
}
