// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { EventCard } from '../components/EventCard';
import type { FeedFilterContext } from '../components/Layout';
import { StatsBar } from '../components/StatsBar';
import { MONITOR_API_URL, useEventStream } from '../hooks/useEventStream';
import { usePumpPortalFeed } from '../hooks/usePumpPortalFeed';
import type { FeedEvent } from '../components/EventCard';
import type { EventType, PumpEvent } from '../types';

/**
 * Live dashboard.
 *
 * Two real sources feed it, and nothing else:
 *
 *   1. The public pump.fun firehose (PumpPortal WebSocket). Always on, no key
 *      required, carries launches, graduations and whale trades.
 *   2. Your own @pumpkit/monitor bot over SSE, when `VITE_API_URL` points at
 *      one. That is the only source of claim, CTO and distribution events.
 *
 * When a source has nothing, the UI says so. It never invents an event.
 */

/** Selectable whale cutoffs, in SOL. */
const WHALE_THRESHOLDS = [1, 5, 10, 25] as const;
const DEFAULT_WHALE_THRESHOLD = 5;

/** Event types only a running monitor bot can produce. */
const MONITOR_ONLY: ReadonlySet<EventType> = new Set<EventType>(['claim', 'cto', 'distribution']);

const FILTERS: { key: EventType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'launch', label: '🚀 Launches' },
  { key: 'whale', label: '🐋 Whales' },
  { key: 'graduation', label: '🎓 Graduations' },
  { key: 'claim', label: '💰 Claims' },
  { key: 'cto', label: '👑 CTO' },
  { key: 'distribution', label: '💎 Distributions' },
];

/** Map a monitor-bot SSE event onto the shape the feed renders. */
function toFeedEvent(e: PumpEvent): FeedEvent {
  const rec = e as unknown as Record<string, unknown>;
  const address = (rec.creator ?? rec.claimerWallet ?? rec.wallet ?? '') as string;
  return {
    id: `monitor-${e.txSignature}`,
    type: e.type as EventType,
    timestamp: e.timestamp,
    txSignature: e.txSignature,
    tokenMint: rec.tokenMint as string | undefined,
    tokenName: (rec.tokenName as string) ?? (rec.name as string) ?? 'Unknown',
    tokenSymbol: (rec.tokenSymbol as string) ?? (rec.symbol as string) ?? '???',
    creator: address,
    creatorAddress: address || undefined,
    amountSol: (rec.amountSol as number) ?? 0,
    // V2 quote-mint fields (2026-05-21 rollout). When present, EventCard
    // renders the V2 amount/ticker instead of `amountSol`.
    amountQuote: typeof rec.amountQuote === 'number' ? rec.amountQuote : undefined,
    quoteTicker: typeof rec.quoteTicker === 'string' ? rec.quoteTicker : undefined,
    direction: rec.direction as 'buy' | 'sell' | undefined,
    newCreator: rec.newCreator as string | undefined,
    shareholders: rec.shareholders as { address: string; amount: number }[] | undefined,
    isNew: true,
  };
}

function SkeletonCard() {
  return (
    <div className="flex gap-2 items-start animate-pulse">
      <div className="w-10 h-10 rounded-full bg-tg-input shrink-0" />
      <div className="bg-tg-bubble-in rounded-2xl rounded-tl-sm px-4 py-3 w-2/3">
        <div className="h-3 bg-tg-input rounded w-40" />
        <div className="h-3 bg-tg-input rounded w-24 mt-2" />
        <div className="h-3 bg-tg-input rounded w-32 mt-2" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { feedQuery } = useOutletContext<FeedFilterContext>();
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const [whaleThreshold, setWhaleThreshold] = useState<number>(DEFAULT_WHALE_THRESHOLD);

  const firehose = usePumpPortalFeed({ whaleThresholdSol: whaleThreshold });
  const monitor = useEventStream();

  const monitorConnected = monitor.status === 'connected';

  /** Both sources, newest first, de-duplicated by id. */
  const feedEvents = useMemo<FeedEvent[]>(() => {
    const merged = [...firehose.events, ...monitor.events.map(toFeedEvent)];
    const seen = new Set<string>();
    return merged
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }, [firehose.events, monitor.events]);

  const query = feedQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    const byType = filter === 'all' ? feedEvents : feedEvents.filter((e) => e.type === filter);
    if (!query) return byType;
    return byType.filter((e) =>
      [e.tokenName, e.tokenSymbol, e.tokenMint, e.creator, e.creatorAddress]
        .some((field) => field?.toLowerCase().includes(query)),
    );
  }, [feedEvents, filter, query]);

  const isLive = firehose.status === 'live' || monitorConnected;
  const waitingForFirst = feedEvents.length === 0 && !firehose.error;

  const sourceLabel =
    firehose.status === 'live'
      ? 'Live · pump.fun firehose'
      : firehose.status === 'connecting'
        ? 'Connecting to the pump.fun firehose…'
        : firehose.status === 'reconnecting'
          ? 'Reconnecting to the pump.fun firehose…'
          : 'Firehose off';

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-2.75rem)]">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-tg-chat/95 backdrop-blur-sm border-b border-tg-border px-4 py-2">
        <div className="flex gap-2 overflow-x-auto max-w-3xl mx-auto items-center">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isLive ? 'bg-pump-green animate-pulse-glow' : 'bg-pump-orange'
            }`}
            title={isLive ? 'Receiving live events' : 'Connecting to the feed'}
            aria-label={isLive ? 'Feed is live' : 'Feed is connecting'}
          />
          <div className="w-px h-5 bg-tg-border mx-1" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`px-3 py-1.5 rounded-full text-sm transition whitespace-nowrap active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tg-blue ${
                filter === f.key
                  ? 'bg-tg-blue text-white shadow-tg'
                  : 'bg-tg-input text-zinc-400 hover:text-white hover:bg-tg-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Whale cutoff. Real trades, so the threshold is worth exposing. */}
        {(filter === 'all' || filter === 'whale') && (
          <div className="flex gap-2 items-center max-w-3xl mx-auto mt-2 text-xs text-zinc-500">
            <span>Whale cutoff</span>
            {WHALE_THRESHOLDS.map((t) => (
              <button
                key={t}
                onClick={() => setWhaleThreshold(t)}
                aria-pressed={whaleThreshold === t}
                className={`px-2 py-0.5 rounded-full transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tg-blue ${
                  whaleThreshold === t
                    ? 'bg-pump-orange/20 text-pump-orange'
                    : 'bg-tg-input text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t} SOL
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-4 max-w-3xl mx-auto">
          <StatsBar
            events={feedEvents}
            connected={isLive}
            sourceLabel={monitorConnected ? 'the firehose + your monitor bot' : 'the pump.fun firehose'}
          />

          <div className="text-center py-2">
            <span className="bg-tg-input/80 text-zinc-400 text-xs px-3 py-1 rounded-full">
              {sourceLabel}
              {monitorConnected ? ' · monitor bot connected' : ''}
            </span>
          </div>

          {/* Transport error: name what broke, offer the retry. */}
          {firehose.error && firehose.status !== 'live' && (
            <div className="bg-pump-pink/10 border border-pump-pink/30 rounded-xl px-4 py-3 text-center">
              <p className="text-sm text-zinc-200">{firehose.error}</p>
              <p className="text-xs text-zinc-400 mt-1">
                Retrying automatically. The feed resumes on its own once the connection is back.
              </p>
              <button
                onClick={firehose.reconnect}
                className="mt-2 bg-tg-input text-tg-blue text-xs rounded-lg px-3 py-1.5 hover:brightness-125 transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tg-blue"
              >
                Retry now
              </button>
            </div>
          )}

          {filtered.length === 0 && MONITOR_ONLY.has(filter as EventType) && !monitorConnected ? (
            <div className="text-center py-12 px-4">
              <p className="text-4xl mb-3">🔌</p>
              <p className="text-zinc-300 text-sm font-medium">
                {FILTERS.find((f) => f.key === filter)?.label} come from your own bot
              </p>
              <p className="text-zinc-500 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                The public firehose carries launches, graduations and whale trades. Claim, CTO and
                fee-distribution events are decoded by{' '}
                <code className="text-zinc-400">@pumpkit/monitor</code>, which you run yourself.
                Point the dashboard at it with <code className="text-zinc-400">VITE_API_URL</code>.
              </p>
              <a
                href="https://github.com/nirholas/pumpkit#quick-start"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 bg-tg-input text-tg-blue text-xs rounded-lg px-3 py-1.5 hover:brightness-125 transition active:scale-95"
              >
                Run a monitor bot
              </a>
            </div>
          ) : waitingForFirst ? (
            <div
              className="flex flex-col gap-2"
              aria-busy="true"
              aria-label="Waiting for the first event"
            >
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <p className="text-center text-xs text-zinc-500 pt-2">
                Waiting for the next pump.fun event…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔍</p>
              {query ? (
                <>
                  <p className="text-zinc-400 text-sm">
                    No event in the feed matches “{feedQuery.trim()}”.
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    The filter searches token name, symbol, mint and wallet across the
                    {' '}
                    {feedEvents.length} {feedEvents.length === 1 ? 'event' : 'events'} received so far.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-zinc-400 text-sm">Nothing matching this filter yet.</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    {filter === 'whale'
                      ? `No trade has cleared ${whaleThreshold} SOL since you opened this page.`
                      : 'New events land here the moment they hit the chain.'}
                  </p>
                </>
              )}
            </div>
          ) : (
            filtered.map((event) => <EventCard key={event.id} event={event} />)
          )}
        </div>
      </div>

      {/* Bottom info bar */}
      <div className="border-t border-tg-border px-4 py-2 text-center">
        <span className="text-xs text-zinc-500">
          {feedEvents.length} live {feedEvents.length === 1 ? 'event' : 'events'}
          {monitorConnected
            ? ` · monitor bot at ${MONITOR_API_URL}`
            : ' · set VITE_API_URL to add claim, CTO and distribution events'}
        </span>
      </div>
    </div>
  );
}
