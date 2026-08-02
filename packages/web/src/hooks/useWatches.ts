// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
//  

import { useCallback, useEffect, useState } from 'react';
import { addWatch, fetchWatches, isMonitorConfigured, removeWatch } from '../lib/api';
import type { WatchResponse } from '../lib/types';

interface UseWatchesReturn {
  watches: WatchResponse[];
  loading: boolean;
  error: string | null;
  add: (address: string, label?: string) => Promise<void>;
  remove: (address: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Watched wallets, stored by the monitor bot.
 *
 * Watches live on the bot, so with no bot configured there is nothing to load
 * and nothing to write. The hook reports that state instead of failing a fetch.
 */
export function useWatches(): UseWatchesReturn {
  const [watches, setWatches] = useState<WatchResponse[]>([]);
  const [loading, setLoading] = useState(isMonitorConfigured);
  const [error, setError] = useState<string | null>(
    isMonitorConfigured ? null : 'Link a monitor bot to watch wallets.',
  );

  const refresh = useCallback(async () => {
    if (!isMonitorConfigured) return;
    try {
      setError(null);
      const data = await fetchWatches();
      setWatches(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch watches');
    } finally {
      setLoading(false);
    }
  }, []);

  const add = useCallback(async (address: string, label?: string) => {
    try {
      setError(null);
      const watch = await addWatch(address, label);
      setWatches((prev) => [...prev, watch]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add watch');
    }
  }, []);

  const remove = useCallback(async (address: string) => {
    try {
      setError(null);
      await removeWatch(address);
      setWatches((prev) => prev.filter((w) => w.wallet !== address));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove watch');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { watches, loading, error, add, remove, refresh };
}
