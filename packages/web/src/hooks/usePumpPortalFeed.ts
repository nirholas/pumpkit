// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedEvent } from '../components/EventCard';

/**
 * Live pump.fun firehose, straight from the browser.
 *
 * PumpPortal exposes a free, keyless WebSocket that re-broadcasts pump.fun
 * program activity. One socket carries every subscription, so this hook owns a
 * single connection and multiplexes:
 *
 *   subscribeNewToken   → launch events
 *   subscribeMigration  → graduation events
 *   subscribeTokenTrade → buy/sell events for recently launched mints,
 *                         surfaced as whales once they clear the SOL threshold
 *
 * Claim, CTO and distribution events are not part of this feed: they come from
 * a monitor bot you run yourself (see `useEventStream`). The dashboard merges
 * both sources.
 *
 * PumpPortal asks clients to keep a single connection open rather than opening
 * one per subscription, so never mount this hook twice in the same tree.
 */

const PUMPPORTAL_URL = 'wss://pumpportal.fun/api/data';

/** Feed cap. Older events are dropped as new ones arrive. */
const MAX_EVENTS = 200;

/**
 * How many recent mints stay subscribed for trade activity. PumpPortal charges
 * nothing for this, but every extra mint is bandwidth the browser has to parse,
 * and interest in a mint decays fast.
 */
const TRADE_WINDOW = 40;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type FeedStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface PumpPortalMessage {
  signature?: string;
  mint?: string;
  traderPublicKey?: string;
  txType?: string;
  solAmount?: number;
  marketCapSol?: number;
  name?: string;
  symbol?: string;
  uri?: string;
  pool?: string;
  message?: string;
  errors?: string[];
}

interface UsePumpPortalFeedOptions {
  /** Minimum trade size, in SOL, that counts as a whale. */
  whaleThresholdSol?: number;
  /** Set false to leave the socket closed (used when a monitor bot supersedes it). */
  enabled?: boolean;
}

interface UsePumpPortalFeedReturn {
  events: FeedEvent[];
  status: FeedStatus;
  /** Set when the socket failed and a retry is pending, so the UI can say why. */
  error: string | null;
  /** Drop the backoff and retry immediately. */
  reconnect: () => void;
}

/** Token identity learned from launch events, so trades can render a name. */
interface TokenMeta {
  name: string;
  symbol: string;
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function usePumpPortalFeed(
  options: UsePumpPortalFeedOptions = {},
): UsePumpPortalFeedReturn {
  const { whaleThresholdSol = 5, enabled = true } = options;

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [status, setStatus] = useState<FeedStatus>(enabled ? 'connecting' : 'offline');
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryDelayRef = useRef(RECONNECT_BASE_MS);
  const tokenMetaRef = useRef(new Map<string, TokenMeta>());
  const tradeWindowRef = useRef<string[]>([]);
  /**
   * Read through a ref inside the message handler. Closing over the value would
   * make `handleMessage` a new function on every threshold change, which the
   * connect effect depends on, which would drop and reopen the socket. PumpPortal
   * asks for one stable connection, so a filter change must not touch transport.
   */
  const whaleThresholdRef = useRef(whaleThresholdSol);
  whaleThresholdRef.current = whaleThresholdSol;
  /** Bumped to force the connect effect to re-run on a manual retry. */
  const [retryNonce, setRetryNonce] = useState(0);

  const push = useCallback((event: FeedEvent) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === event.id)) return prev;
      return [event, ...prev].slice(0, MAX_EVENTS);
    });
  }, []);

  /**
   * Track a freshly launched mint and subscribe to its trades, evicting the
   * oldest mint once the window is full so the socket stays cheap.
   */
  const trackMint = useCallback((socket: WebSocket, mint: string) => {
    const window = tradeWindowRef.current;
    if (window.includes(mint)) return;

    window.push(mint);
    socket.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [mint] }));

    while (window.length > TRADE_WINDOW) {
      const evicted = window.shift();
      if (!evicted) break;
      tokenMetaRef.current.delete(evicted);
      socket.send(JSON.stringify({ method: 'unsubscribeTokenTrade', keys: [evicted] }));
    }
  }, []);

  const handleMessage = useCallback(
    (socket: WebSocket, raw: string) => {
      let msg: PumpPortalMessage;
      try {
        msg = JSON.parse(raw) as PumpPortalMessage;
      } catch {
        return;
      }

      // Subscription acknowledgements carry no event payload.
      if (!msg.txType || !msg.mint || !msg.signature) return;

      // PumpPortal timestamps nothing; the receive time is within a second of
      // the transaction and is the honest thing to show.
      const timestamp = new Date().toISOString();
      const meta = tokenMetaRef.current.get(msg.mint);

      if (msg.txType === 'create') {
        const name = msg.name?.trim() || 'Unnamed token';
        const symbol = msg.symbol?.trim() || '???';
        tokenMetaRef.current.set(msg.mint, { name, symbol });
        trackMint(socket, msg.mint);

        push({
          id: `launch-${msg.signature}`,
          type: 'launch',
          timestamp,
          txSignature: msg.signature,
          tokenMint: msg.mint,
          tokenName: name,
          tokenSymbol: symbol,
          creator: msg.traderPublicKey ? shortAddress(msg.traderPublicKey) : '',
          creatorAddress: msg.traderPublicKey,
          amountSol: msg.solAmount ?? 0,
          marketCapSol: msg.marketCapSol,
          isNew: true,
        });
        return;
      }

      if (msg.txType === 'migrate') {
        push({
          id: `graduation-${msg.signature}`,
          type: 'graduation',
          timestamp,
          txSignature: msg.signature,
          tokenMint: msg.mint,
          tokenName: meta?.name ?? shortAddress(msg.mint),
          tokenSymbol: meta?.symbol ?? '???',
          creator: '',
          amountSol: msg.solAmount ?? 0,
          marketCapSol: msg.marketCapSol,
          isNew: true,
        });
        return;
      }

      if (msg.txType === 'buy' || msg.txType === 'sell') {
        const sol = msg.solAmount ?? 0;
        if (sol < whaleThresholdRef.current) return;

        push({
          id: `whale-${msg.signature}`,
          type: 'whale',
          timestamp,
          txSignature: msg.signature,
          tokenMint: msg.mint,
          tokenName: meta?.name ?? shortAddress(msg.mint),
          tokenSymbol: meta?.symbol ?? '???',
          creator: msg.traderPublicKey ? shortAddress(msg.traderPublicKey) : '',
          creatorAddress: msg.traderPublicKey,
          amountSol: sol,
          marketCapSol: msg.marketCapSol,
          direction: msg.txType,
          isNew: true,
        });
      }
    },
    [push, trackMint],
  );

  const reconnect = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    retryDelayRef.current = RECONNECT_BASE_MS;
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    let disposed = false;
    setStatus((prev) => (prev === 'live' ? 'reconnecting' : prev));

    let socket: WebSocket;
    try {
      socket = new WebSocket(PUMPPORTAL_URL);
    } catch (err) {
      setStatus('reconnecting');
      setError(err instanceof Error ? err.message : 'Could not open the feed socket');
      retryTimerRef.current = setTimeout(() => setRetryNonce((n) => n + 1), retryDelayRef.current);
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, RECONNECT_MAX_MS);
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (disposed) return;
      retryDelayRef.current = RECONNECT_BASE_MS;
      setStatus('live');
      setError(null);
      // A fresh socket carries no subscriptions, so re-arm every one of them.
      socket.send(JSON.stringify({ method: 'subscribeNewToken' }));
      socket.send(JSON.stringify({ method: 'subscribeMigration' }));
      const tracked = tradeWindowRef.current;
      if (tracked.length > 0) {
        socket.send(JSON.stringify({ method: 'subscribeTokenTrade', keys: [...tracked] }));
      }
    };

    socket.onmessage = (event) => {
      if (disposed) return;
      handleMessage(socket, typeof event.data === 'string' ? event.data : '');
    };

    socket.onerror = () => {
      if (disposed) return;
      setError('Lost the connection to the pump.fun firehose.');
    };

    socket.onclose = () => {
      if (disposed) return;
      setStatus('reconnecting');
      const delay = retryDelayRef.current;
      retryTimerRef.current = setTimeout(() => setRetryNonce((n) => n + 1), delay);
      retryDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
    };

    return () => {
      disposed = true;
      clearTimeout(retryTimerRef.current);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    };
  }, [enabled, handleMessage, retryNonce]);

  return { events, status, error, reconnect };
}
