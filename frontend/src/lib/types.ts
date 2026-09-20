export const TICKER_UNIVERSE = [
  'AAPL',
  'GOOGL',
  'MSFT',
  'AMZN',
  'TSLA',
  'NVDA',
  'META',
  'JPM',
  'V',
  'NFLX',
] as const;

export type Ticker = (typeof TICKER_UNIVERSE)[number];

export type Direction = 'up' | 'down' | 'flat';

export interface PriceTick {
  ticker: string;
  price: number;
  prev_price: number;
  change: number;
  change_percent: number;
  direction: Direction;
  timestamp: string;
}

export interface PricePoint {
  ticker: string;
  price: number;
  timestamp: string;
}

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  unrealized_pnl: number;
  pnl_percent: number;
}

export interface Portfolio {
  cash_balance: number;
  positions: Position[];
  total_value: number;
  total_pnl: number;
}

export interface PortfolioSnapshot {
  total_value: number;
  recorded_at: string;
}

export interface WatchlistItem {
  ticker: string;
  price: number | null;
  prev_price: number | null;
  change_percent: number | null;
  direction: Direction;
}

export type TradeSide = 'buy' | 'sell';

export interface TradeRequest {
  ticker: string;
  quantity: number;
  side: TradeSide;
}

export interface TradeResult {
  ticker: string;
  side: TradeSide;
  quantity: number;
  price: number;
  cash_balance: number;
}

export interface ChatAction {
  type: 'trade' | 'watchlist';
  detail: string;
  success: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions: ChatAction[] | null;
  created_at: string;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';
