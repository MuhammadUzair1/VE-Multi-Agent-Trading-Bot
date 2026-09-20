import type { PricePoint } from '@/lib/types';

interface SparklineProps {
  points: PricePoint[];
  width?: number;
  height?: number;
}

export default function Sparkline({ points, width = 90, height = 28 }: SparklineProps) {
  if (points.length < 2) {
    return <div style={{ width, height }} className="text-[10px] text-gray-600">—</div>;
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const isUp = prices[prices.length - 1] >= prices[0];

  const coords = prices.map((price, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((price - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={isUp ? '#26a65b' : '#e5484d'}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
