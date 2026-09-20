import type { Position } from '@/lib/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel">
      <h2 className="border-b border-base-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Positions
      </h2>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-base-panel text-gray-500">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Ticker</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-right font-medium">Avg Cost</th>
              <th className="px-2 py-1.5 text-right font-medium">Price</th>
              <th className="px-2 py-1.5 text-right font-medium">P&amp;L</th>
              <th className="px-3 py-1.5 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ticker} className="border-t border-base-border/60">
                <td className="px-3 py-1.5 font-mono font-semibold text-gray-100">{p.ticker}</td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-300">{p.quantity}</td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-300">{formatUsd(p.avg_cost)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-300">{formatUsd(p.current_price)}</td>
                <td className={`px-2 py-1.5 text-right font-mono ${p.unrealized_pnl >= 0 ? 'text-up' : 'text-down'}`}>
                  {p.unrealized_pnl >= 0 ? '+' : ''}
                  {formatUsd(p.unrealized_pnl)}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono ${p.pnl_percent >= 0 ? 'text-up' : 'text-down'}`}>
                  {p.pnl_percent >= 0 ? '+' : ''}
                  {p.pnl_percent.toFixed(2)}%
                </td>
              </tr>
            ))}
            {positions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-600">
                  No open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
