import type {
  ChatMessage,
  Portfolio,
  PortfolioSnapshot,
  PricePoint,
  TradeRequest,
  TradeResult,
  WatchlistItem,
} from './types';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || res.statusText, res.status);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  getWatchlist: () => request<WatchlistItem[]>('/watchlist'),
  addToWatchlist: (ticker: string) =>
    request<WatchlistItem[]>('/watchlist', {
      method: 'POST',
      body: JSON.stringify({ ticker }),
    }),
  removeFromWatchlist: (ticker: string) =>
    request<void>(`/watchlist/${ticker}`, { method: 'DELETE' }),

  getHistory: (ticker: string) => request<PricePoint[]>(`/prices/${ticker}/history`),

  getPortfolio: () => request<Portfolio>('/portfolio'),
  getPortfolioHistory: () => request<PortfolioSnapshot[]>('/portfolio/history'),
  trade: (payload: TradeRequest) =>
    request<TradeResult>('/portfolio/trade', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getChatHistory: () => request<ChatMessage[]>('/chat'),
  sendChatMessage: (content: string) =>
    request<ChatMessage>('/chat', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};

export { ApiError };
