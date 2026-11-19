// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
// Developed by nirholas / nichxbt — https://x.com/nichxbt | https://github.com/nirholas

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    fetchPublic,
    fetchPublicJson,
    HttpLimitError,
    isPublicAddress,
    UnsafeUrlError,
} from '../net/http.js';

describe('isPublicAddress()', () => {
    it.each([
        '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
        '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
        '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1',
    ])('refuses %s', (ip) => {
        expect(isPublicAddress(ip)).toBe(false);
    });

    it.each(['1.1.1.1', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:1.1.1.1'])('accepts %s', (ip) => {
        expect(isPublicAddress(ip)).toBe(true);
    });

    it('refuses hostnames, which are not addresses', () => {
        expect(isPublicAddress('example.com')).toBe(false);
    });
});

describe('fetchPublic() guards', () => {
    it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/x', 'not a url'])(
        'refuses %s before sending anything',
        async (url) => {
            await expect(fetchPublic(url)).rejects.toBeInstanceOf(UnsafeUrlError);
        },
    );

    it.each([
        'http://127.0.0.1:9/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]:9/',
        'http://10.0.0.1/',
        'http://[::ffff:127.0.0.1]:9/',
    ])('refuses private address literal %s', async (url) => {
        await expect(fetchPublic(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    });

    it('refuses a hostname that resolves to a private address', async () => {
        await expect(fetchPublic('http://localhost:9/')).rejects.toBeInstanceOf(UnsafeUrlError);
    });
});

describe('fetchPublic() against an operator-trusted host', () => {
    let server: Server;
    let base: string;

    beforeAll(async () => {
        server = createServer((req, res) => {
            if (req.url === '/json') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ name: 'PumpKitty' }));
            } else if (req.url === '/big') {
                res.writeHead(200);
                res.end(Buffer.alloc(4096, 0x61));
            } else if (req.url === '/stream') {
                res.writeHead(200);
                const timer = setInterval(() => res.write(Buffer.alloc(1024, 0x61)), 5);
                res.on('close', () => clearInterval(timer));
            } else if (req.url === '/slow') {
                setTimeout(() => res.end('late'), 2_000).unref();
            } else if (req.url === '/echo' && req.method === 'POST') {
                let body = '';
                req.on('data', (c: Buffer) => (body += c.toString()));
                req.on('end', () => res.end(body));
            } else if (req.url === '/redirect') {
                res.writeHead(302, { Location: 'http://169.254.169.254/' });
                res.end();
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const trusted = { allowPrivateNetwork: true } as const;

    it('returns status and body', async () => {
        const res = await fetchPublic(`${base}/json`, trusted);
        expect(res.ok).toBe(true);
        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('{"name":"PumpKitty"}');
    });

    it('parses JSON and returns null for a non-2xx status', async () => {
        await expect(fetchPublicJson(`${base}/json`, trusted)).resolves.toEqual({ name: 'PumpKitty' });
        await expect(fetchPublicJson(`${base}/missing`, trusted)).resolves.toBeNull();
    });

    it('sends a POST body', async () => {
        const res = await fetchPublic(`${base}/echo`, { ...trusted, method: 'POST', body: 'hello' });
        expect(res.body.toString()).toBe('hello');
    });

    it('does not follow redirects', async () => {
        const res = await fetchPublic(`${base}/redirect`, trusted);
        expect(res.status).toBe(302);
        expect(res.ok).toBe(false);
    });

    it('rejects a declared body larger than maxBytes', async () => {
        await expect(fetchPublic(`${base}/big`, { ...trusted, maxBytes: 1024 })).rejects.toBeInstanceOf(HttpLimitError);
    });

    it('rejects an endless body once it passes maxBytes', async () => {
        await expect(fetchPublic(`${base}/stream`, { ...trusted, maxBytes: 8 * 1024 })).rejects.toBeInstanceOf(
            HttpLimitError,
        );
    });

    it('rejects when the deadline passes', async () => {
        await expect(fetchPublic(`${base}/slow`, { ...trusted, timeoutMs: 100 })).rejects.toBeInstanceOf(HttpLimitError);
    });
});
