import path from 'node:path';

import { z } from 'zod';

// The only module allowed to read process.env. Everything else receives typed
// values, so no part of the code has to guess whether a variable was set.
//
// The persistence target is a single Supabase project reached over HTTPS. There
// is no driver to choose any more: the connection is fully described by a URL
// and a service-role key. A full configuration module with an example file and
// secret scanning is EN-30; this is the minimum EN-09 needs.

const EnvSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export interface Config {
    port: number;
    staticDir: string;
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
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
    };
}
