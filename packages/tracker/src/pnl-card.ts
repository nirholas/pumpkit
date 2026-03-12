// ── Outsiders Bot — PNL Card Generator (canvas) ───────────────────
// Generates shareable PNL images. Falls back to text if canvas unavailable.

import { log } from './logger.js';
import type { PnlCardData } from './types.js';

let canvasAvailable = false;
let createCanvas: any;
let registerFont: any;

// Try importing canvas — it requires native deps that may not be available
try {
  const canvasLib = await import('canvas');
  createCanvas = canvasLib.createCanvas;
  registerFont = canvasLib.registerFont;
  canvasAvailable = true;
  log.info('Canvas module loaded — PNL image generation enabled');
} catch {
  log.warn('Canvas module not available — PNL will use text fallback');
}

export function isPnlImageAvailable(): boolean {
  return canvasAvailable;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

const TIER_COLORS: Record<string, string> = {
  Oracle: '#FFD700',
  Guru: '#C0C0C0',
  Contender: '#CD7F32',
  Novice: '#6B7280',
  Amateur: '#9CA3AF',
};

export async function generatePnlCard(data: PnlCardData): Promise<Buffer | null> {
  if (!canvasAvailable) return null;

  const W = 800;
  const H = 450;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#0f0f23');
  gradient.addColorStop(1, '#1a1a3e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Border accent
  const borderColor = data.multiplier >= 10 ? '#FFD700' : data.multiplier >= 2 ? '#00FF88' : '#FF4444';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('OUTSIDERS', 30, 55);

  // Rank badge
  const rankColor = TIER_COLORS[data.rank] ?? '#9CA3AF';
  ctx.fillStyle = rankColor;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(data.rank.toUpperCase(), W - 30, 55);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = '#333366';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 75);
  ctx.lineTo(W - 30, 75);
  ctx.stroke();

  // Token name + symbol
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(`${data.tokenName} (${data.tokenSymbol})`, 30, 120);

  // Caller
  ctx.fillStyle = '#AAAACC';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Called by ${data.callerName}`, 30, 155);

  // Chain
  ctx.fillStyle = '#888899';
  ctx.font = '16px sans-serif';
  ctx.fillText(`Chain: ${data.chain.toUpperCase()}`, 30, 185);

  // MCap at call
  ctx.fillStyle = '#AAAACC';
  ctx.font = '20px sans-serif';
  ctx.fillText('MCap at Call', 30, 235);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(fmtNum(data.mcapAtCall), 30, 270);

  // ATH MCap
  ctx.fillStyle = '#AAAACC';
  ctx.font = '20px sans-serif';
  ctx.fillText('ATH MCap', 400, 235);
  ctx.fillStyle = '#00FF88';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(fmtNum(data.athMcap), 400, 270);

  // Multiplier (big center)
  const xText = `${data.multiplier.toFixed(1)}x`;
  const pctText = `+${((data.multiplier - 1) * 100).toFixed(0)}%`;
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(xText, W / 2, 370);

  ctx.fillStyle = '#AAAACC';
  ctx.font = '24px sans-serif';
  ctx.fillText(pctText, W / 2, 405);
  ctx.textAlign = 'left';

  // Date
  ctx.fillStyle = '#666688';
  ctx.font = '14px sans-serif';
  ctx.fillText(data.callDate, 30, H - 20);

  // Watermark
  ctx.textAlign = 'right';
  ctx.fillText('outsiders.bot', W - 30, H - 20);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
