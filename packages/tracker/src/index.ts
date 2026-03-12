// ── Outsiders Bot — Entry Point ────────────────────────────────────

import { loadConfig } from './config.js';
import { initDb, closeDb, getActiveCalls } from './db.js';
import { setLogLevel, log } from './logger.js';
import { setApiBase } from './token-service.js';
import { createBot } from './bot.js';
import { startAthTracker, stopAthTracker } from './ath-tracker.js';
import { startHealthServer, stopHealthServer } from './health.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  setApiBase(config.dexscreenerApi);

  log.info('──────────────────────────────────────');
  log.info('  👥 Outsiders Bot starting…');
  log.info('──────────────────────────────────────');

  // Database
  initDb(config.dbPath);

  // ATH polling
  startAthTracker(config.athPollInterval);

  // Telegram bot
  const bot = createBot(config);

  bot.catch((err) => {
    log.error(`Bot error: ${err.message}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down…');
    stopHealthServer();
    stopAthTracker();
    await bot.stop();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Health server
  const startedAt = Date.now();
  startHealthServer({
    startedAt,
    getStats: () => ({
      activeCalls: getActiveCalls().length,
    }),
  });

  // Start polling
  await bot.start({
    onStart: () => log.info('Bot is running! Listening for messages…'),
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
