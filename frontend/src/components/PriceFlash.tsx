import type { Direction } from '@/lib/types';

interface PriceFlashProps {
  children: React.ReactNode;
  direction: Direction;
  flashKey: string;
  className?: string;
}

const FLASH_CLASS: Record<Direction, string> = {
  up: 'animate-flash-up',
  down: 'animate-flash-down',
  flat: '',
};

export default function PriceFlash({ children, direction, flashKey, className = '' }: PriceFlashProps) {
  return (
    <span key={flashKey} className={`${className} rounded px-1 ${FLASH_CLASS[direction]}`}>
      {children}
    </span>
  );
}
