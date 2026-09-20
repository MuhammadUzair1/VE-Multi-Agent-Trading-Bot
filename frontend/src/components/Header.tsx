import ConnectionStatus from './ConnectionStatus';
import type { ConnectionState } from '@/lib/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

interface HeaderProps {
  totalValue: number;
  cashBalance: number;
  connectionState: ConnectionState;
}

export default function Header({ totalValue, cashBalance, connectionState }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-base-border bg-base-panel px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold tracking-tight text-accent-yellow">FinAlly</span>
        <span className="hidden text-xs text-gray-500 sm:inline">AI Trading Workstation</span>
      </div>

      <div className="flex items-center gap-8">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Portfolio Value</div>
          <div className="font-mono text-base font-semibold text-gray-100">{formatUsd(totalValue)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Cash</div>
          <div className="font-mono text-base font-semibold text-accent-blue">{formatUsd(cashBalance)}</div>
        </div>
        <ConnectionStatus state={connectionState} />
      </div>
    </header>
  );
}
