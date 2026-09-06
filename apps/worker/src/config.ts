import { z } from 'zod';

// The worker's own configuration module, for the same reason the API has one:
// a single place reads the environment and everything else receives typed
// values. It asks for less than the API, because a consumer needs the broker
// and the store it writes to, and nothing else.

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const EnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    REDIS_URL: z.string().url(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    // How long a fetch waits before looping. It is not a poll interval: the
    // read blocks until an event arrives, and this only bounds how quickly the
    // process notices it has been asked to stop.
    WORKER_BLOCK_SECONDS: z.coerce.number().int().positive().max(60).default(5),
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface WorkerConfig {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    redisUrl: string;
    logLevel: LogLevel;
    blockSeconds: number;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
    const parsed = EnvSchema.safeParse(env);

    if (!parsed.success) {
        const missing = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
        throw new Error(`Invalid environment: ${missing}`);
    }

    return {
        supabaseUrl: parsed.data.SUPABASE_URL,
        supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
        redisUrl: parsed.data.REDIS_URL,
        logLevel: parsed.data.LOG_LEVEL,
        blockSeconds: parsed.data.WORKER_BLOCK_SECONDS,
    };
}
