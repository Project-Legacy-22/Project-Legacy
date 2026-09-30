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
    // The broker of ADR-0007, and the transport the notification flow will keep
    // using. Required by whoever relays or consumes -- start() refuses to boot
    // without it, so a long-running process still cannot fill the outbox with
    // events nobody delivers.
    //
    // Optional in the schema because serving HTTP does not need it: no route
    // touches the bus, only start() and stop() do. A serverless function that
    // never relays was refusing to load over a variable it would not have
    // used, which took the whole deployment down -- /auth/me answered 500 and
    // the interface said it could not check the session.
    REDIS_URL: z.string().url().optional(),
    // Optional: absent, it is `info`. An optional variable is declared here
    // like every other one, otherwise its default ends up scattered across the
    // code that consumes it and the example file stops being the reference.
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    // Optional: absent, it is `development`. One thing depends on it, the
    // Secure flag of the session cookie, which a browser drops over plain
    // http -- and plain http is how the application is served in development.
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // The one browser origin allowed to make a cross-origin call. The front is
    // served from the API's own origin in every environment (the dev proxy
    // forwards /auth and /items), so this is only ever consulted to refuse
    // everything else. Optional: absent, it is the Vite dev server. Production
    // sets the deployed origin. Never a wildcard.
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    // How many proxy hops in front of the process to trust when deriving the
    // caller's address. That address is the rate limiter's client key, so a
    // wrong value here either lets one client past the limit or lumps every
    // client behind the proxy into one bucket. Optional: absent, it is 0, which
    // trusts no forwarded header -- correct for a direct connection and for
    // development. Behind one reverse proxy in production, set it to 1.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // The secret the scheduled workflow presents to trigger a delivery pass. Without it, the route
    // does not exist: a target that runs the relay continuously does not need it.
    RELAY_SECRET: z.string().min(32).optional(),
    // What Vercel sets on every deployment. Optional because they exist nowhere else: in
    // development, in a container and in continuous integration, the application must start without
    // them.
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
    VERCEL_GIT_COMMIT_REF: z.string().optional(),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
});

// Twelve characters: enough to find the commit, not enough to lengthen a label every series would
// carry.
const SHORT_COMMIT = 12;

// "unknown" and not the empty string when the variable is missing. An empty label reads as a value
// -- one believes one is reading a branch called nothing -- whereas a named value reads as what it
// is, an absence.
const ABSENT = 'unknown';

function named(value: string | undefined, length = 0): string {
    const clean = (value ?? '').trim();
    if (clean === '') return ABSENT;

    return length === 0 ? clean : clean.slice(0, length);
}

export type LogLevel = (typeof LOG_LEVELS)[number];

// The deployment that answers, as it identifies itself. Used as labels of legacy22_build_info, so
// that a dip on a graph can be matched with a delivery.
export interface Deployment {
    commit: string;
    ref: string;
    environment: string;
}

export interface Config {
    port: number;
    staticDir: string;
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    supabaseAnonKey: string;
    logLevel: LogLevel;
    secureCookies: boolean;
    redisUrl: string | undefined;
    webOrigin: string;
    trustProxy: number;
    relaySecret: string | undefined;
    deployment: Deployment;
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
        redisUrl: parsed.data.REDIS_URL,
        secureCookies: parsed.data.NODE_ENV === 'production',
        webOrigin: parsed.data.WEB_ORIGIN,
        trustProxy: parsed.data.TRUST_PROXY,
        relaySecret: parsed.data.RELAY_SECRET,
        deployment: {
            commit: named(parsed.data.VERCEL_GIT_COMMIT_SHA, SHORT_COMMIT),
            ref: named(parsed.data.VERCEL_GIT_COMMIT_REF),
            // "local" rather than "unknown": outside Vercel, it is not a missing value, it is a
            // place.
            environment: parsed.data.VERCEL_ENV ?? 'local',
        },
    };
}
