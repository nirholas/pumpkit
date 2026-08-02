// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

export type DotStatus = 'connected' | 'connecting' | 'disconnected' | 'not-configured';

const COLORS: Record<DotStatus, string> = {
  connected: 'bg-pump-green',
  connecting: 'bg-pump-yellow animate-pulse',
  disconnected: 'bg-pump-pink',
  'not-configured': 'bg-zinc-600',
};

const LABELS: Record<DotStatus, string> = {
  connected: 'Bot connected',
  connecting: 'Connecting...',
  disconnected: 'Bot offline',
  // Nothing is broken here: no bot was ever pointed at this page.
  'not-configured': 'No bot linked',
};

const TITLES: Record<DotStatus, string> = {
  connected: 'A monitor bot is reachable and reporting healthy',
  connecting: 'Contacting the monitor bot',
  disconnected: 'The configured monitor bot is not responding',
  'not-configured': 'Set VITE_API_URL to link your own @pumpkit/monitor bot',
};

/** Connection status indicator dot for the monitor bot link. */
export function StatusDot({ status }: { status: DotStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-zinc-400"
      title={TITLES[status]}
    >
      <span className={`w-2 h-2 rounded-full ${COLORS[status]}`} />
      {LABELS[status]}
    </span>
  );
}
