// ── Outsiders Bot — ATH Tracker ────────────────────────────────────
// Polls active calls and updates their ATH market cap / price.

import { getActiveCalls, updateCallAth, finalizeCall } from './db.js';
import { fetchTokenInfo } from './token-service.js';
import { log } from './logger.js';

const MAX_TRACK_HOURS = 48; // stop tracking after 48h

let timer: ReturnType<typeof setInterval> | null = null;

export function startAthTracker(intervalSec: number): void {
  if (timer) return;
  log.info(`ATH tracker started (interval: ${intervalSec}s)`);
  timer = setInterval(() => void pollActiveCalls(), intervalSec * 1000);
  // Run immediately on start
  void pollActiveCalls();
}

export function stopAthTracker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log.info('ATH tracker stopped');
  }
}

async function pollActiveCalls(): Promise<void> {
  const calls = getActiveCalls();
  if (calls.length === 0) return;

  log.debug(`Polling ATH for ${calls.length} active calls`);

  for (const call of calls) {
    // Check age — finalize if too old
    const ageMs = Date.now() - new Date(call.created_at + 'Z').getTime();
    if (ageMs > MAX_TRACK_HOURS * 60 * 60 * 1000) {
      finalizeCall(call.id);
      log.debug(`Finalized call ${call.id} (expired)`);
      continue;
    }

    try {
      const info = await fetchTokenInfo(call.token_address, call.chain);
      if (info && info.mcap > 0) {
        updateCallAth(call.id, info.mcap, info.price);
      }
    } catch (err) {
      log.warn(`ATH poll error for call ${call.id}: ${err}`);
    }
  }
}
