'use client';

import { ResponsiveContainer, Treemap } from 'recharts';
import type { Position } from '@/lib/types';

interface PortfolioHeatmapProps {
  positions: Position[];
}

function colorForPnlPercent(pct: number): string {
  const clamped = Math.max(-10, Math.min(10, pct));
  const intensity = Math.abs(clamped) / 10;
  if (pct >= 0) {
    // dark-green to bright-green
    const g = Math.round(90 + intensity * 90);
    return `rgb(20, ${g}, 70)`;
  }
  const r = Math.round(120 + intensity * 100);
  return `rgb(${r}, 40, 50)`;
}

interface HeatmapNode {
  name: string;
  size: number;
  pnlPercent: number;
}

function CellContent(props: { x?: number; y?: number; width?: number; height?: number; payload?: HeatmapNode }) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || width < 2 || height < 2) return null;
  const showLabel = width > 50 && height > 30;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={colorForPnlPercent(payload.pnlPercent)}
        stroke="#0d1117"
        strokeWidth={2}
      />
      {showLabel && (
        <text x={x + 6} y={y + 16} fill="#e6edf3" fontSize={12} fontWeight={600} fontFamily="ui-monospace, monospace">
          {payload.name}
        </text>
      )}
      {showLabel && (
        <text x={x + 6} y={y + 32} fill="#c9d1d9" fontSize={11} fontFamily="ui-monospace, monospace">
          {payload.pnlPercent >= 0 ? '+' : ''}
          {payload.pnlPercent.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export default function PortfolioHeatmap({ positions }: PortfolioHeatmapProps) {
  const data: HeatmapNode[] = positions.map((p) => ({
    name: p.ticker,
    size: Math.max(p.quantity * p.current_price, 0.01),
    pnlPercent: p.pnl_percent,
  }));

  return (
    <section className="flex h-full flex-col rounded-md border border-base-border bg-base-panel p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Portfolio Heatmap</h2>
      <div className="min-h-0 flex-1">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={data} dataKey="size" stroke="#0d1117" content={<CellContent />} isAnimationActive={false} />
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-600">No open positions</div>
        )}
      </div>
    </section>
  );
}
