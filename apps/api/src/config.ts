import path from 'node:path';

import { z } from 'zod';

// The only module allowed to read process.env. Everything else receives typed
// values, so no part of the code has to guess whether a variable was set, and
// a reader looking for what the application expects has one file to open.
//
// The persistence target is a single Supabase project reached over HTTPS. The
// connection is fully described by a URL and two keys, one per adapter.

// The levels pino accepts. Enumerating them rather than taking a free string
// makes a typo fail at startup, naming the variable, instead of reaching pino
// and configuring a logger nobody asked for.
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    // Read by the data adapter. It bypasses row-level security, so it never
    // leaves the server.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    // Read by the authentication adapter. Public by design: it is the key a
    // browser would carry, and what it can reach is what the policies allow.
    SUPABASE_ANON_KEY: z.string().min(1),
    // Optional: absent, it is `info`. An optional variable is declared here
    // like every other one, otherwise its default ends up scattered across the
    // code that consumes it and the example file stops being the reference.
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    // Optional: absent, it is `development`. One thing depends on it, the
    // Secure flag of the session cookie, which a browser drops over plain
    // http -- and plain http is how the application is served in development.
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
    port: number;
    staticDir: string;
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    supabaseAnonKey: string;
    logLevel: LogLevel;
    secureCookies: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
    const parsed = EnvSchema.safeParse(env);

    if (!parsed.success) {
        // Name every offending variable and refuse to start. A misconfigured
        // process that boots and fails on the first request is harder to
        // diagnose than one that never boots.
        const missing = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
        throw new Error(`Invalid environment: ${missing}`);
    }

    return {
        port: 3000,
        // Vite writes its production bundle next to the compiled API output.
        // During development the web app is served separately by Vite.
        staticDir: path.join(import.meta.dirname, 'static'),
        supabaseUrl: parsed.data.SUPABASE_URL,
        supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
        supabaseAnonKey: parsed.data.SUPABASE_ANON_KEY,
        logLevel: parsed.data.LOG_LEVEL,
        secureCookies: parsed.data.NODE_ENV === 'production',
    };
}
