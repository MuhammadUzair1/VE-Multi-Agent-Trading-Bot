'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import WatchlistPanel from '@/components/WatchlistPanel';
import MainChart from '@/components/MainChart';
import PortfolioHeatmap from '@/components/PortfolioHeatmap';
import PnLChart from '@/components/PnLChart';
import PositionsTable from '@/components/PositionsTable';
import TradeBar from '@/components/TradeBar';
import ChatPanel from '@/components/ChatPanel';
import { api, ApiError } from '@/lib/api';
import { usePriceStream } from '@/lib/usePriceStream';
import { DEFAULT_CASH_BALANCE } from '@/lib/constants';
import { TICKER_UNIVERSE } from '@/lib/types';
import type { ChatMessage, Portfolio, PortfolioSnapshot, TradeSide } from '@/lib/types';

const EMPTY_PORTFOLIO: Portfolio = {
  cash_balance: DEFAULT_CASH_BALANCE,
  positions: [],
  total_value: DEFAULT_CASH_BALANCE,
  total_pnl: 0,
};

export default function Home() {
  const { prices, history, connectionState, seedHistory } = usePriceStream();

  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([...TICKER_UNIVERSE]);
  const [portfolio, setPortfolio] = useState<Portfolio>(EMPTY_PORTFOLIO);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    api
      .getWatchlist()
      .then((items) => {
        const tickers = items.map((i) => i.ticker);
        setWatchlistTickers(tickers);
        setSelectedTicker((current) => current ?? tickers[0] ?? null);
      })
      .catch(() => {
        setSelectedTicker((current) => current ?? TICKER_UNIVERSE[0]);
      });

    api.getPortfolio().then(setPortfolio).catch(() => undefined);
    api.getPortfolioHistory().then(setSnapshots).catch(() => undefined);
    api.getChatHistory().then(setChatMessages).catch(() => undefined);
  }, []);

  useEffect(() => {
    watchlistTickers.forEach((ticker) => {
      api
        .getHistory(ticker)
        .then((points) => seedHistory(ticker, points))
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistTickers]);

  const refreshPortfolio = async () => {
    try {
      const data = await api.getPortfolio();
      setPortfolio(data);
    } catch {
      // backend unavailable; keep last known state
    }
  };

  const handleTrade = async (ticker: string, quantity: number, side: TradeSide) => {
    setTradeError(null);
    try {
      await api.trade({ ticker, quantity, side });
      await refreshPortfolio();
    } catch (err) {
      setTradeError(err instanceof ApiError ? err.message : 'Trade failed — backend unavailable');
    }
  };

  const handleAddTicker = async (ticker: string) => {
    setWatchlistTickers((prev) => (prev.includes(ticker) ? prev : [...prev, ticker]));
    try {
      await api.addToWatchlist(ticker);
    } catch {
      // optimistic update stands even if the request fails; backend is source of truth once live
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    setWatchlistTickers((prev) => prev.filter((t) => t !== ticker));
    if (selectedTicker === ticker) {
      setSelectedTicker(watchlistTickers.find((t) => t !== ticker) ?? null);
    }
    try {
      await api.removeFromWatchlist(ticker);
    } catch {
      // ignore — see handleAddTicker
    }
  };

  const handleSendChat = async (content: string) => {
    const optimisticUser: ChatMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
      actions: null,
      created_at: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, optimisticUser]);
    setChatLoading(true);
    try {
      const reply = await api.sendChatMessage(content);
      setChatMessages((prev) => [...prev, reply]);
      await refreshPortfolio();
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: "I can't reach the FinAlly backend right now. Please try again once it's running.",
          actions: null,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const selectedTick = selectedTicker ? prices[selectedTicker] : undefined;
  const selectedHistory = selectedTicker ? (history[selectedTicker] ?? []) : [];

  return (
    <div className="flex h-screen flex-col">
      <Header totalValue={portfolio.total_value} cashBalance={portfolio.cash_balance} connectionState={connectionState} />

      <main className="grid min-h-0 flex-1 grid-cols-[300px_1fr_360px] gap-3 p-3">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1">
            <WatchlistPanel
              tickers={watchlistTickers}
              prices={prices}
              history={history}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
              onAdd={handleAddTicker}
              onRemove={handleRemoveTicker}
            />
          </div>
          <TradeBar selectedTicker={selectedTicker} onTrade={handleTrade} errorMessage={tradeError} />
        </div>

        <div className="grid min-h-0 grid-rows-[1.2fr_1fr_1fr] gap-3">
          <MainChart ticker={selectedTicker} points={selectedHistory} tick={selectedTick} />
          <div className="grid min-h-0 grid-cols-2 gap-3">
            <PortfolioHeatmap positions={portfolio.positions} />
            <PnLChart snapshots={snapshots} />
          </div>
          <PositionsTable positions={portfolio.positions} />
        </div>

        <div className="min-h-0">
          <ChatPanel messages={chatMessages} onSend={handleSendChat} isLoading={chatLoading} />
        </div>
      </main>
    </div>
  );
}
