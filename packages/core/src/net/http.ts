// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas
// Part of PumpKit — https://github.com/nirholas/pumpkit

/**
 * @pumpkit/core — Outbound HTTP for untrusted URLs
 *
 * Token metadata URIs and webhook targets come from people PumpKit does not
 * trust. Fetching them with plain `fetch()` lets a coin creator point the bot
 * at cloud metadata endpoints or services on the bot's private network
 * (SSRF), stream an endless body into memory, or hold a socket open forever.
 *
 * `fetchPublic()` guards against all three:
 *   - only http(s) URLs,
 *   - every address the host resolves to must be publicly routable, checked
 *     inside the socket's DNS lookup so a rebinding resolver cannot swap in
 *     a private address after the check,
 *   - redirects are not followed,
 *   - one deadline covers connect, headers and body,
 *   - the body is capped at `maxBytes`.
 */

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/** Thrown when a URL is refused before any request is sent. */
export class UnsafeUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeUrlError';
    }
}

/** Thrown when a request exceeds its deadline or body size limit. */
export class HttpLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HttpLimitError';
    }
}

const blocked = new BlockList();
for (const [net, prefix] of [
    ['0.0.0.0', 8], // "this" network
    ['10.0.0.0', 8], // private
    ['100.64.0.0', 10], // carrier-grade NAT
    ['127.0.0.0', 8], // loopback
    ['169.254.0.0', 16], // link-local, cloud metadata
    ['172.16.0.0', 12], // private
    ['192.0.0.0', 24], // IETF protocol assignments
    ['192.0.2.0', 24], // documentation
    ['192.168.0.0', 16], // private
    ['198.18.0.0', 15], // benchmarking
    ['198.51.100.0', 24], // documentation
    ['203.0.113.0', 24], // documentation
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved, broadcast
] as const) {
    blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
    ['::', 128], // unspecified
    ['::1', 128], // loopback
    ['64:ff9b::', 96], // NAT64, can reach IPv4 internals
    ['64:ff9b:1::', 48], // local-use NAT64
    ['100::', 64], // discard
    ['2001:db8::', 32], // documentation
    ['fc00::', 7], // unique local
    ['fe80::', 10], // link-local
    ['ff00::', 8], // multicast
] as const) {
    blocked.addSubnet(net, prefix, 'ipv6');
}

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** True when `address` is an IP literal that is publicly routable. */
export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blocked.check(address, 'ipv4');
    if (family === 6) {
        const mapped = IPV4_MAPPED.exec(address);
        if (mapped) return isPublicAddress(mapped[1]!);
        if (/^::ffff:/i.test(address)) return false;
        return !blocked.check(address, 'ipv6');
    }
    return false;
}

export interface FetchPublicOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    /** Deadline for the whole exchange, body included. Default 10 000 ms. */
    timeoutMs?: number;
    /** Largest body accepted. Default 1 MiB. */
    maxBytes?: number;
    /**
     * Skip the public-address check. Only for hosts the operator configured
     * (a self-hosted IPFS gateway, say), never for URLs read from chain or
     * supplied by users.
     */
    allowPrivateNetwork?: boolean;
}

export interface PublicResponse {
    status: number;
    ok: boolean;
    headers: IncomingHttpHeaders;
    body: Buffer;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

/** Parse `raw` and refuse anything but an http(s) URL. */
export function parseHttpUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new UnsafeUrlError(`not a valid URL: ${raw.slice(0, 100)}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new UnsafeUrlError(`unsupported URL scheme ${url.protocol}`);
    }
    return url;
}

const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
        if (err) {
            callback(err, '', 0);
            return;
        }
        const refused = addresses.find((a) => !isPublicAddress(a.address));
        if (refused || addresses.length === 0) {
            callback(new UnsafeUrlError(`${hostname} resolves to a non-public address`), '', 0);
            return;
        }
        if (options.all) {
            callback(null, addresses);
        } else {
            const first = addresses[0]!;
            callback(null, first.address, first.family);
        }
    });
};

/**
 * Make one HTTP(S) request to a URL that came from an untrusted source.
 * Resolves with the response (any status). Rejects with `UnsafeUrlError`,
 * `HttpLimitError` or a network error.
 */
export function fetchPublic(rawUrl: string, options: FetchPublicOptions = {}): Promise<PublicResponse> {
    let url: URL;
    try {
        url = parseHttpUrl(rawUrl);
    } catch (err) {
        return Promise.reject(err);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!options.allowPrivateNetwork && isIP(host) && !isPublicAddress(host)) {
        return Promise.reject(new UnsafeUrlError(`${host} is not a public address`));
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise<PublicResponse>((resolve, reject) => {
        let settled = false;
        const finish = (err: Error | null, res?: PublicResponse): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) {
                req.destroy();
                reject(err);
            } else {
                resolve(res!);
            }
        };

        const req = send(
            url,
            {
                method: options.method ?? 'GET',
                headers: options.headers,
                ...(options.allowPrivateNetwork ? {} : { lookup: publicOnlyLookup }),
            },
            (res) => {
                const declared = Number(res.headers['content-length']);
                if (Number.isFinite(declared) && declared > maxBytes) {
                    finish(new HttpLimitError(`response body of ${declared} bytes exceeds ${maxBytes}`));
                    return;
                }
                const chunks: Buffer[] = [];
                let size = 0;
                res.on('data', (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > maxBytes) {
                        finish(new HttpLimitError(`response body exceeds ${maxBytes} bytes`));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    const status = res.statusCode ?? 0;
                    finish(null, {
                        status,
                        ok: status >= 200 && status < 300,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    });
                });
                res.on('error', (err) => finish(err));
            },
        );

        const timer = setTimeout(
            () => finish(new HttpLimitError(`request to ${url.host} timed out after ${timeoutMs}ms`)),
            timeoutMs,
        );
        req.on('error', (err) => finish(err));
        req.end(options.body);
    });
}

/**
 * GET a JSON document from an untrusted URL. Returns `null` for a non-2xx
 * status. Rejects on unsafe URLs, limits, network errors and invalid JSON.
 */
export async function fetchPublicJson(
    rawUrl: string,
    options: Omit<FetchPublicOptions, 'method' | 'body'> = {},
): Promise<unknown> {
    const res = await fetchPublic(rawUrl, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
    });
    if (!res.ok) return null;
    return JSON.parse(res.body.toString('utf8')) as unknown;
}
