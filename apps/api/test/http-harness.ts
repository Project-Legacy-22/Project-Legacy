import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

import type { Config } from '../src/config.js';
import type { RecordingLogger } from './fakes/recording-logger.js';

// Headers as a plain object rather than HeadersInit: every suite builds them
// that way, and the harness has to be able to add a cookie to them.
export type TestRequestInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

export interface Harness {
    request: (path: string, init?: TestRequestInit) => Promise<Response>;
    close: () => Promise<void>;
    logger: RecordingLogger;
}

// The repository and the identity provider are fakes in these suites, so the
// Supabase settings are never dialled: they only satisfy the type. Cookies are
// not marked secure, because the harness serves plain http and a browser would
// drop a secure cookie there.
export const testConfig: Config = {
    port: 0,
    // No directory is served here: only the API contract is under test.
    staticDir: import.meta.dirname,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseServiceRoleKey: 'test-service-role-key',
    supabaseAnonKey: 'test-anon-key',
    // Le journal est capture par un logger d essai ; le niveau ne sert
    // qu a satisfaire le type.
    logLevel: 'info',
    secureCookies: false,
};

export function json(method: string, body: unknown): TestRequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// The routes are exercised over real HTTP rather than by calling a handler with
// a hand-made req/res pair. Status codes, response shapes and the error
// middleware's output are the contract clients depend on; calling the handler
// directly would assert the code's shape instead of that contract.
//
// Port 0 lets the operating system pick a free port, so a test never collides
// with a running dev server or with another test. A cookie given here is sent
// with every request, which is how a suite runs as an authenticated caller.
export async function listen(
    app: Express,
    logger: RecordingLogger,
    cookie?: string,
): Promise<Harness> {
    const server = createHttpServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${String(port)}`;

    return {
        logger,
        request: (path, init = {}) => {
            const headers =
                cookie === undefined ? init.headers : { ...init.headers, Cookie: cookie };

            // exactOptionalPropertyTypes: passing `headers: undefined` is not
            // the same as omitting it, and fetch only accepts the omission.
            return fetch(`${origin}${path}`, headers === undefined ? init : { ...init, headers });
        },
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) reject(error);
                    else resolve();
                });
            }),
    };
}
