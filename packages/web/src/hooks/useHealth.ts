// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

import { useCallback, useEffect, useState } from 'react';
import { fetchHealth, isMonitorConfigured } from '../lib/api';
import type { HealthResponse } from '../lib/types';

interface UseHealthReturn {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
  /** False when no monitor bot is configured, so nothing is polled. */
  configured: boolean;
  refresh: () => Promise<void>;
}

/**
 * Polls a monitor bot's health endpoint.
 *
 * With no bot configured there is nothing to poll, so the hook stays idle
 * instead of failing a request every interval for the life of the page.
 */
export function useHealth(pollIntervalMs = 15_000): UseHealthReturn {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(isMonitorConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isMonitorConfigured) return;
    try {
      setError(null);
      const data = await fetchHealth();
      setHealth(data);
    } catch (e) {
      setHealth(null);
      setError(e instanceof Error ? e.message : 'Health check failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMonitorConfigured) return;
    void refresh();
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(id);
  }, [refresh, pollIntervalMs]);

  return { health, loading, error, configured: isMonitorConfigured, refresh };
}
