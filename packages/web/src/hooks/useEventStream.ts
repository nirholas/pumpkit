// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

import { useEffect, useRef, useState } from 'react';
import type { PumpEvent } from '../lib/types';

const MAX_EVENTS = 200;

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'not-configured';

interface UseEventStreamReturn {
  events: PumpEvent[];
  status: ConnectionStatus;
}

/** Base URL of a monitor bot's REST/SSE API, or '' when none is configured. */
export const MONITOR_API_URL: string = import.meta.env.VITE_API_URL || '';

/**
 * Connects to the monitor bot SSE stream and returns a list of events.
 * Auto-reconnects on disconnection with exponential backoff.
 *
 * With no `VITE_API_URL` there is no bot to talk to, so the hook reports
 * `not-configured` and never opens a connection. Without that guard a static
 * deployment would retry its own origin forever against an endpoint that
 * cannot exist there.
 */
export function useEventStream(): UseEventStreamReturn {
  const [events, setEvents] = useState<PumpEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>(
    MONITOR_API_URL ? 'connecting' : 'not-configured',
  );
  const retryDelay = useRef(1000);

  useEffect(() => {
    if (!MONITOR_API_URL) return;

    let eventSource: EventSource | null = null;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      setStatus('connecting');
      eventSource = new EventSource(`${MONITOR_API_URL}/api/v1/claims/stream`);

      eventSource.onopen = () => {
        if (!mounted) return;
        retryDelay.current = 1000;
        setStatus('connected');
      };

      eventSource.onmessage = (msg) => {
        if (!mounted) return;
        try {
          const event = JSON.parse(msg.data) as PumpEvent;
          setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
        } catch {
          // skip malformed messages
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (!mounted) return;
        setStatus('disconnected');
        setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
      };
    }

    connect();

    return () => {
      mounted = false;
      eventSource?.close();
    };
  }, []);

  return { events, status };
}
