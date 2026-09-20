import type { ConnectionState } from '@/lib/types';

const CONFIG: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: 'bg-up', label: 'Connected' },
  reconnecting: { color: 'bg-accent-yellow', label: 'Reconnecting…' },
  disconnected: { color: 'bg-down', label: 'Disconnected' },
};

export default function ConnectionStatus({ state }: { state: ConnectionState }) {
  const { color, label } = CONFIG[state];
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className={`h-2 w-2 rounded-full ${color} ${state === 'connected' ? 'animate-pulse' : ''}`} />
      <span>{label}</span>
    </div>
  );
}
