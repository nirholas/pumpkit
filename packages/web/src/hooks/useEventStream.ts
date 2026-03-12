import { useEffect, useRef, useState } from 'react';
import type { PumpEvent } from '../lib/types';

const MAX_EVENTS = 200;

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UseEventStreamReturn {
  events: PumpEvent[];
  status: ConnectionStatus;
}

/**
 * Connects to the monitor bot SSE stream and returns a list of events.
 * Auto-reconnects on disconnection with exponential backoff.
 */
export function useEventStream(): UseEventStreamReturn {
  const [events, setEvents] = useState<PumpEvent[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const retryDelay = useRef(1000);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      setStatus('connecting');
      const baseUrl = import.meta.env.VITE_API_URL || '';
      eventSource = new EventSource(`${baseUrl}/api/v1/claims/stream`);

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
