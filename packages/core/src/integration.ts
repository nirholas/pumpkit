// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/atomic

/**
 * @pumpkit/core — Integration Identifier
 *
 * Single canonical config field for partner / referral / telemetry tagging.
 * Every PumpKit bot reads from the same env var so downstream services
 * (analytics, fee-share programs, partner dashboards) can attribute traffic
 * back to a specific integration.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Config field: PUMPKIT_INTEGRATION_ID
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Accepts any of:
 *   - **Referral code** — e.g. `ref_abc123`, issued by an upstream service
 *   - **Partner ID**    — e.g. `partner_acme`, for revenue-share programs
 *   - **Telemetry tag** — e.g. `bot-prod-eu-1`, for fleet-level tracing
 *
 * Format: 1–64 chars, `[A-Za-z0-9_.:-]` only. Invalid values are rejected at
 * read time with a clear error so they don't silently propagate.
 *
 * Aliases (read in priority order): PUMPKIT_INTEGRATION_ID, PUMPKIT_PARTNER_ID,
 * PUMPKIT_REFERRAL_CODE. The first non-empty wins.
 *
 * Exposure:
 *   - `getIntegrationId()` — typed accessor with validation + memoization
 *   - `INTEGRATION_ID_HEADER` — outbound HTTP header name for fetch/webhook code
 *   - Auto-included in /health endpoint output via @pumpkit/core's health server
 *   - Auto-included in webhook payloads dispatched via the retry helper
 *
 * ```ts
 * import { getIntegrationId, INTEGRATION_ID_HEADER } from '@pumpkit/core';
 *
 * const id = getIntegrationId();          // 'partner_acme' | null
 * const headers = { ...id && { [INTEGRATION_ID_HEADER]: id } };
 * ```
 */

const ALIAS_KEYS = [
  'PUMPKIT_INTEGRATION_ID',
  'PUMPKIT_PARTNER_ID',
  'PUMPKIT_REFERRAL_CODE',
] as const;

const VALID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Outbound HTTP header name for propagating the integration identifier. */
export const INTEGRATION_ID_HEADER = 'x-pumpkit-integration-id';

let cached: string | null | undefined;

/**
 * Read the configured integration identifier from the environment.
 * Returns `null` when unset (no error — running without an ID is supported).
 * Throws if any alias is set to a value that doesn't match `VALID_RE`.
 *
 * Result is memoized for the lifetime of the process. Call `resetIntegrationIdCache()`
 * in tests to clear it.
 */
export function getIntegrationId(): string | null {
  if (cached !== undefined) return cached;

  for (const key of ALIAS_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    if (!VALID_RE.test(value)) {
      throw new Error(
        `Invalid ${key}: ${JSON.stringify(value)} — must match ${VALID_RE} ` +
          `(1-64 chars, alphanumerics and ._:- only).`,
      );
    }
    cached = value;
    return cached;
  }

  cached = null;
  return cached;
}

/**
 * Resolve which alias (if any) provided the active integration identifier.
 * Useful for diagnostics — `/health` reports both the value and its source.
 */
export function getIntegrationIdSource(): (typeof ALIAS_KEYS)[number] | null {
  for (const key of ALIAS_KEYS) {
    const raw = process.env[key]?.trim();
    if (raw) return key;
  }
  return null;
}

/** Clear the memoized integration id. Test-only. */
export function resetIntegrationIdCache(): void {
  cached = undefined;
}

/**
 * Convenience: build an outbound HTTP headers object that includes the
 * integration ID when one is configured. Returns an empty object otherwise,
 * so callers can spread unconditionally:
 *
 * ```ts
 * await fetch(url, {
 *   headers: { 'content-type': 'application/json', ...integrationHeaders() },
 * });
 * ```
 */
export function integrationHeaders(): Record<string, string> {
  const id = getIntegrationId();
  return id ? { [INTEGRATION_ID_HEADER]: id } : {};
}

/**
 * Stamp a JSON-serializable payload with the integration identifier under
 * the `integrationId` key. No-op when unset. Returns a *new* object — does
 * not mutate the input.
 */
export function stampPayload<T extends Record<string, unknown>>(
  payload: T,
): T & { integrationId?: string } {
  const id = getIntegrationId();
  return id ? { ...payload, integrationId: id } : payload;
}
