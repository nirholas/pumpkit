// ── Outsiders Bot — Telegram Bot (grammy) ──────────────────────────

import { Bot, InlineKeyboard, type Context } from 'grammy';
import { log } from './logger.js';
import * as db from './db.js';
import { parseTokenInput, fetchTokenInfo } from './token-service.js';
import {
  formatCallSimple,
  formatCallAdvanced,
  formatCallsLeaderboard,
  formatPerformanceLeaderboard,
  formatLastCalls,
  formatUserStats,
  formatHardcoreStatus,
  formatPnlText,
  formatSettings,
} from './formatters.js';
import type { BotConfig, CallType, LeaderboardTimeframe } from './types.js';

// ── Pending auto-calls (token address → timeout handle) ────────────
const pendingAutoCalls = new Map<string, ReturnType<typeof setTimeout>>();

export function createBot(config: BotConfig): Bot {
  const bot = new Bot(config.telegramBotToken);

  // ── Middleware: ensure user & group exist ──────────────────────
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      db.upsertUser(ctx.from.id, ctx.from.username ?? null, ctx.from.first_name);
    }
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      db.upsertGroup(ctx.chat.id, ctx.chat.title ?? '');
    }
    await next();
  });

  // ── /start ────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `👥 <b>Outsiders Bot</b>\n\nTrack calls, rank callers, and compete on leaderboards.\n\nUse /help for commands.`,
      { parse_mode: 'HTML' },
    );
  });

  // ── /help ─────────────────────────────────────────────────────
  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '👥 <b>Outsiders Commands</b>',
        '',
        '<b>Group:</b>',
        '/leaderboard — Calls or Performance rankings',
        '/last &lt;N&gt; — Show last N calls',
        '/calls @user — Show user\'s calls',
        '/winrate @user — Show user\'s win rate',
        '/pnl &lt;CA&gt; — Generate PNL card',
        '/alpha &lt;CA&gt; — Make an alpha call',
        '/gamble &lt;CA&gt; — Make a gamble call',
        '/hardcore — Hardcore mode status',
        '',
        '<b>Admin:</b>',
        '/settings — Configure bot',
        '/wipeleaderboard — Clear all calls',
        '/block — Reply to block a user',
        '/unblock — Reply to unblock a user',
        '',
        '<b>DM:</b>',
        '/rank — Your overall rank card',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  });

  // ── /leaderboard ──────────────────────────────────────────────
  bot.command('leaderboard', async (ctx) => {
    if (!isGroup(ctx)) return;

    const kb = new InlineKeyboard()
      .text('📊 Calls', 'lb:calls:24h')
      .text('⭐ Performance', 'lb:perf:24h')
      .row()
      .text('24h', 'lb:_:24h')
      .text('7d', 'lb:_:7d')
      .text('30d', 'lb:_:30d')
      .text('All', 'lb:_:all');

    await ctx.reply('Choose leaderboard type:', { reply_markup: kb });
  });

  bot.callbackQuery(/^lb:(calls|perf):(24h|7d|30d|all)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^lb:(calls|perf):(24h|7d|30d|all)$/);
    if (!match || !ctx.chat) return;

    const type = match[1];
    const tf = match[2] as LeaderboardTimeframe;

    let text: string;
    if (type === 'calls') {
      const entries = db.getCallsLeaderboard(ctx.chat.id, tf);
      text = formatCallsLeaderboard(entries, tf);
    } else {
      const entries = db.getPerformanceLeaderboard(ctx.chat.id, tf);
      text = formatPerformanceLeaderboard(entries, tf);
    }

    // Update buttons to reflect current selection
    const kb = new InlineKeyboard()
      .text(type === 'calls' ? '📊 Calls ✓' : '📊 Calls', `lb:calls:${tf}`)
      .text(type === 'perf' ? '⭐ Perf ✓' : '⭐ Performance', `lb:perf:${tf}`)
      .row()
      .text(tf === '24h' ? '[24h]' : '24h', `lb:${type}:24h`)
      .text(tf === '7d' ? '[7d]' : '7d', `lb:${type}:7d`)
      .text(tf === '30d' ? '[30d]' : '30d', `lb:${type}:30d`)
      .text(tf === 'all' ? '[All]' : 'All', `lb:${type}:all`);

    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    await ctx.answerCallbackQuery();
  });

  // Handle timeframe-only buttons (type placeholder)
  bot.callbackQuery(/^lb:_:(24h|7d|30d|all)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Pick Calls or Performance first' });
  });

  // ── /last <N> ─────────────────────────────────────────────────
  bot.command('last', async (ctx) => {
    if (!isGroup(ctx)) return;
    const n = Math.min(Math.max(parseInt(ctx.match as string) || 5, 1), 50);
    const calls = db.getLastCalls(ctx.chat!.id, n);
    await ctx.reply(formatLastCalls(calls), { parse_mode: 'HTML' });
  });

  // ── /calls @user ──────────────────────────────────────────────
  bot.command('calls', async (ctx) => {
    if (!isGroup(ctx)) return;
    const mentioned = ctx.message?.entities
      ?.filter((e) => e.type === 'mention')
      .map((e) => ctx.message!.text!.slice(e.offset + 1, e.offset + e.length));

    if (!mentioned || mentioned.length === 0) {
      await ctx.reply('Usage: /calls @username');
      return;
    }

    // Find user by username
    const targetUser = mentioned[0];
    await ctx.reply(`📋 Use /last to see recent calls, or /winrate @${targetUser} for stats.`);
  });

  // ── /winrate @user ────────────────────────────────────────────
  bot.command('winrate', async (ctx) => {
    if (!isGroup(ctx)) return;
    const target = getTargetUser(ctx);
    if (!target) {
      await ctx.reply('Usage: /winrate @username (or reply to a message)');
      return;
    }

    const stats = db.getUserStats(target.id, ctx.chat!.id);
    const name = target.username ?? target.firstName;
    await ctx.reply(formatUserStats(name, stats), { parse_mode: 'HTML' });
  });

  // ── /alpha <CA> and /gamble <CA> ──────────────────────────────
  bot.command('alpha', (ctx) => handleManualCall(ctx, 'alpha'));
  bot.command('gamble', (ctx) => handleManualCall(ctx, 'gamble'));

  // ── /pnl <CA> ────────────────────────────────────────────────
  bot.command('pnl', async (ctx) => {
    if (!isGroup(ctx)) return;
    const input = (ctx.match as string)?.trim();
    if (!input) {
      await ctx.reply('Usage: /pnl &lt;CA&gt;', { parse_mode: 'HTML' });
      return;
    }

    const parsed = parseTokenInput(input);
    if (!parsed) {
      await ctx.reply('❌ Could not parse token address.');
      return;
    }

    const call = db.getCallByToken(parsed.address, ctx.chat!.id);
    if (!call) {
      await ctx.reply('❌ No call found for this token in this group.');
      return;
    }

    const token = await fetchTokenInfo(parsed.address, parsed.chain);
    const name = token?.name ?? 'Unknown';
    const user = db.getUser(ctx.from!.id);
    const callerName = user?.username ?? user?.first_name ?? 'Unknown';

    await ctx.reply(formatPnlText(call, name, callerName), { parse_mode: 'HTML' });
  });

  // ── /rank (DM) ───────────────────────────────────────────────
  bot.command('rank', async (ctx) => {
    const stats = db.getUserStats(ctx.from!.id);
    const name = ctx.from!.username ?? ctx.from!.first_name;
    await ctx.reply(formatUserStats(name, stats), { parse_mode: 'HTML' });
  });

  // ── /hardcore ─────────────────────────────────────────────────
  bot.command('hardcore', async (ctx) => {
    if (!isGroup(ctx)) return;
    const group = db.getGroup(ctx.chat!.id);
    if (!group || !group.hardcore_enabled) {
      await ctx.reply('⚔️ Hardcore mode is not enabled. Use /settings to enable it.');
      return;
    }
    const statuses = db.getHardcoreStatus(ctx.chat!.id);
    await ctx.reply(formatHardcoreStatus(statuses, group.hardcore_min_wr), { parse_mode: 'HTML' });
  });

  // ── /settings (admin) ────────────────────────────────────────
  bot.command('settings', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!(await isAdmin(ctx))) {
      await ctx.reply('⚠️ Admin only.');
      return;
    }

    const group = db.getGroup(ctx.chat!.id);
    if (!group) return;

    const kb = new InlineKeyboard()
      .text(`📞 Mode: ${group.call_mode}`, 'set:callmode')
      .text(`📋 Display: ${group.display_mode}`, 'set:displaymode')
      .row()
      .text(`⚔️ Hardcore: ${group.hardcore_enabled ? 'ON' : 'OFF'}`, 'set:hardcore');

    await ctx.reply(
      formatSettings(
        group.call_mode,
        group.display_mode,
        !!group.hardcore_enabled,
        group.hardcore_min_wr,
        group.hardcore_min_calls,
      ),
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  bot.callbackQuery('set:callmode', async (ctx) => {
    if (!ctx.chat || !(await isAdmin(ctx))) return;
    const group = db.getGroup(ctx.chat.id);
    if (!group) return;
    const newMode = group.call_mode === 'auto' ? 'button' : 'auto';
    db.updateGroupSettings(ctx.chat.id, { call_mode: newMode as any });
    await ctx.answerCallbackQuery({ text: `Call mode → ${newMode}` });
    await ctx.editMessageText(`✅ Call mode set to <b>${newMode}</b>`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('set:displaymode', async (ctx) => {
    if (!ctx.chat || !(await isAdmin(ctx))) return;
    const group = db.getGroup(ctx.chat.id);
    if (!group) return;
    const newMode = group.display_mode === 'simple' ? 'advanced' : 'simple';
    db.updateGroupSettings(ctx.chat.id, { display_mode: newMode as any });
    await ctx.answerCallbackQuery({ text: `Display → ${newMode}` });
    await ctx.editMessageText(`✅ Display mode set to <b>${newMode}</b>`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('set:hardcore', async (ctx) => {
    if (!ctx.chat || !(await isAdmin(ctx))) return;
    const group = db.getGroup(ctx.chat.id);
    if (!group) return;
    const newVal = !group.hardcore_enabled;
    db.updateGroupSettings(ctx.chat.id, { hardcore_enabled: newVal as any });
    if (newVal) db.startHardcoreRound(ctx.chat.id);
    await ctx.answerCallbackQuery({ text: `Hardcore ${newVal ? 'ON' : 'OFF'}` });
    await ctx.editMessageText(`⚔️ Hardcore mode <b>${newVal ? 'enabled' : 'disabled'}</b>`, { parse_mode: 'HTML' });
  });

  // ── /wipeleaderboard (admin) ─────────────────────────────────
  bot.command('wipeleaderboard', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!(await isAdmin(ctx))) {
      await ctx.reply('⚠️ Admin only.');
      return;
    }

    const kb = new InlineKeyboard()
      .text('🗑 Confirm Wipe', 'wipe:confirm')
      .text('❌ Cancel', 'wipe:cancel');

    await ctx.reply('⚠️ This will delete ALL calls in this group. Are you sure?', { reply_markup: kb });
  });

  bot.callbackQuery('wipe:confirm', async (ctx) => {
    if (!ctx.chat || !(await isAdmin(ctx))) return;
    const count = db.wipeLeaderboard(ctx.chat.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`🗑 Wiped ${count} calls.`);
  });

  bot.callbackQuery('wipe:cancel', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Cancelled' });
    await ctx.editMessageText('✅ Wipe cancelled.');
  });

  // ── /block and /unblock (admin, reply) ────────────────────────
  bot.command('block', async (ctx) => {
    if (!isGroup(ctx) || !(await isAdmin(ctx))) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await ctx.reply('Reply to a user\'s message to block them.');
      return;
    }
    db.blockUser(ctx.chat!.id, target.id);
    await ctx.reply(`🚫 ${target.first_name} has been blocked from making calls.`);
  });

  bot.command('unblock', async (ctx) => {
    if (!isGroup(ctx) || !(await isAdmin(ctx))) return;
    const target = ctx.message?.reply_to_message?.from;
    if (!target) {
      await ctx.reply('Reply to a user\'s message to unblock them.');
      return;
    }
    db.unblockUser(ctx.chat!.id, target.id);
    await ctx.reply(`✅ ${target.first_name} has been unblocked.`);
  });

  // ── Auto-call detection (message handler) ─────────────────────
  bot.on('message:text', async (ctx) => {
    if (!isGroup(ctx) || !ctx.message.text) return;
    if (ctx.message.text.startsWith('/')) return; // skip commands

    // Check if user is blocked
    if (db.isBlocked(ctx.chat!.id, ctx.from!.id)) return;

    const parsed = parseTokenInput(ctx.message.text);
    if (!parsed) return;

    const group = db.getGroup(ctx.chat!.id);
    if (!group) return;

    if (group.call_mode === 'auto') {
      await handleAutoCall(ctx, parsed.address, parsed.chain);
    } else {
      await handleButtonCall(ctx, parsed.address, parsed.chain);
    }
  });

  // ── Auto-call: cancel button ──────────────────────────────────
  bot.callbackQuery(/^cancel_call:(.+)$/, async (ctx) => {
    const address = ctx.callbackQuery.data.split(':')[1];
    const key = `${ctx.chat?.id}:${address}`;
    const timer = pendingAutoCalls.get(key);
    if (timer) {
      clearTimeout(timer);
      pendingAutoCalls.delete(key);
      await ctx.editMessageText('🔍 Just scanning — call cancelled.');
    }
    await ctx.answerCallbackQuery();
  });

  // ── Button-mode: call type selection ──────────────────────────
  bot.callbackQuery(/^call:(alpha|gamble):(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^call:(alpha|gamble):(.+)$/);
    if (!match || !ctx.chat) return;

    const callType = match[1] as CallType;
    const address = match[2];

    await registerCall(ctx, address, callType);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^call:skip:/, async (ctx) => {
    await ctx.editMessageText('👀 Not a call — just sharing.');
    await ctx.answerCallbackQuery();
  });

  return bot;
}

// ── Helpers ─────────────────────────────────────────────────────────

function isGroup(ctx: Context): boolean {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

function getTargetUser(ctx: Context): { id: number; username: string; firstName: string } | null {
  // From reply
  const reply = ctx.message?.reply_to_message?.from;
  if (reply) return { id: reply.id, username: reply.username ?? '', firstName: reply.first_name };

  // From mention
  const entities = ctx.message?.entities?.filter((e) => e.type === 'text_mention');
  if (entities && entities.length > 0 && entities[0].user) {
    const u = entities[0].user;
    return { id: u.id, username: u.username ?? '', firstName: u.first_name };
  }

  return null;
}

async function handleManualCall(ctx: Context, callType: CallType): Promise<void> {
  if (!isGroup(ctx)) return;
  const input = (ctx.match as string)?.trim();
  if (!input) {
    await ctx.reply(`Usage: /${callType} &lt;CA&gt;`, { parse_mode: 'HTML' });
    return;
  }

  const parsed = parseTokenInput(input);
  if (!parsed) {
    await ctx.reply('❌ Could not parse token address.');
    return;
  }

  await registerCall(ctx, parsed.address, callType, parsed.chain);
}

async function handleAutoCall(ctx: Context, address: string, chain: string): Promise<void> {
  const key = `${ctx.chat!.id}:${address}`;

  const kb = new InlineKeyboard().text('🔍 Just Scanning', `cancel_call:${address}`);

  const msg = await ctx.reply(
    `🔔 Token detected! Auto-registering call in 30 seconds…\n<code>${address}</code>`,
    { parse_mode: 'HTML', reply_markup: kb },
  );

  const timer = setTimeout(async () => {
    pendingAutoCalls.delete(key);
    await registerCall(ctx, address, 'alpha', chain as any);
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id);
    } catch { /* message may already be gone */ }
  }, 30_000);

  pendingAutoCalls.set(key, timer);
}

async function handleButtonCall(ctx: Context, address: string, chain: string): Promise<void> {
  const kb = new InlineKeyboard()
    .text('🔵 Alpha', `call:alpha:${address}`)
    .text('🎰 Gamble', `call:gamble:${address}`)
    .text('👀 Skip', `call:skip:${address}`);

  await ctx.reply(
    `🪙 Token detected!\n<code>${address}</code>\n\nChoose call type:`,
    { parse_mode: 'HTML', reply_markup: kb },
  );
}

async function registerCall(
  ctx: Context,
  address: string,
  callType: CallType,
  chain?: string,
): Promise<void> {
  try {
    const token = await fetchTokenInfo(address, chain as any);
    if (!token || token.mcap <= 0) {
      await ctx.reply('❌ Could not fetch token data. Try again later.');
      return;
    }

    const call = db.createCall(
      ctx.chat!.id,
      ctx.from!.id,
      address,
      token.chain,
      callType,
      token.mcap,
      token.price,
    );

    const group = db.getGroup(ctx.chat!.id);
    const callerName = ctx.from!.username ?? ctx.from!.first_name;

    const text = group?.display_mode === 'advanced'
      ? formatCallAdvanced(token, callType, callerName)
      : formatCallSimple(token, callType, callerName);

    await ctx.reply(text, { parse_mode: 'HTML' });

    // Forward to call channel if configured
    if (group?.call_channel_id) {
      try {
        await ctx.api.sendMessage(group.call_channel_id, text, { parse_mode: 'HTML' });
      } catch (err) {
        log.warn(`Failed to forward to channel: ${err}`);
      }
    }

    log.info(`Call registered: ${address} by ${callerName} (${callType}) mcap=${token.mcap}`);
  } catch (err) {
    log.error(`registerCall error: ${err}`);
    await ctx.reply('❌ Error registering call.');
  }
}
