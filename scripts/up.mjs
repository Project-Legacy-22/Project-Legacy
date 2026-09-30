// A single command starts everything: the broker, the database and the application.
//
// Three stages to start in order, because each depends on the previous one. The broker is declared
// in compose.yaml; the Supabase stack is orchestrated by its own CLI, which also applies the
// migrations. The script chains the two, then passes to the application the coordinates the CLI has
// just printed: that is what removes the manual copy of .env, which was the only manual step of the
// start-up journey.
//
// Each step is idempotent. Running the command again on a stack already up breaks nothing and does
// not start from scratch: the development data survives a restart.

import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// What the API expects, and where it comes from in the output of the Supabase CLI.
const REQUIRED = {
    SUPABASE_URL: 'API_URL',
    SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY',
    SUPABASE_ANON_KEY: 'ANON_KEY',
};

// The broker listens on the loopback. The default port is Redis's; a computer already running one
// overrides it with REDIS_PORT, otherwise publishing the port would fail at start-up. The same
// value serves compose.yaml and the URL passed to the application, so that the two cannot diverge.
const redisPort = process.env.REDIS_PORT ?? '6379';
const REDIS_URL = `redis://127.0.0.1:${redisPort}`;

function fail(message, detail) {
    console.error(`\n  ${message}\n`);
    if (detail) console.error(`${detail}\n`);
    process.exit(1);
}

// An infrastructure step: it must succeed, its output goes to the terminal. `hint` carries what the
// user can do when it fails, when the command's output does not say it by itself.
function step({ label, command, args, environment = {}, hint }) {
    console.log(`\n  ${label}`);
    const result = spawnSync(command, args, {
        stdio: 'inherit',
        env: { ...process.env, ...environment },
    });

    if (result.error) fail(`${label} : ${command} est introuvable`, result.error.message);
    if (result.status !== 0) fail(`${label} a echoue`, hint);
}

function readSupabaseEnvironment() {
    const result = spawnSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' });

    if (result.status !== 0) {
        fail('Impossible de lire les coordonnees de la pile Supabase', result.stderr);
    }

    // Format `KEY="value"`, one per line. The quotes are removed; a value can contain `=`, hence
    // the split on the first occurrence.
    const values = new Map();
    for (const line of result.stdout.split('\n')) {
        const separator = line.indexOf('=');
        if (separator === -1) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
        if (key) values.set(key, value);
    }

    const environment = {};
    const missing = [];

    for (const [variable, source] of Object.entries(REQUIRED)) {
        const value = values.get(source);
        if (value) environment[variable] = value;
        else missing.push(source);
    }

    if (missing.length > 0) {
        // Name what is missing rather than let the API refuse to start further on with an error
        // that would not point at the real cause.
        fail(
            `La pile Supabase n a pas fourni ${missing.join(', ')}`,
            `  Cles lues : ${[...values.keys()].join(', ') || 'aucune'}`,
        );
    }

    return environment;
}

function requireDockerDaemon() {
    const result = spawnSync('docker', ['info'], { stdio: 'ignore' });

    if (result.error || result.status !== 0) {
        fail(
            'Docker ne repond pas. Demarrer Docker Desktop, puis relancer npm run up.',
            '  Docker fait tourner le broker et la pile Supabase : rien ne peut demarrer sans lui.',
        );
    }
}

requireDockerDaemon();

step({
    label: 'Broker',
    command: 'docker',
    args: ['compose', 'up', '-d', '--wait'],
    environment: { REDIS_PORT: redisPort },
    hint: `  Si le port ${redisPort} est deja pris, en choisir un autre :\n    REDIS_PORT=6380 npm run up`,
});

step({
    label: 'Base de donnees et migrations',
    command: npmCommand,
    args: ['run', 'db:start'],
});

const supabaseEnvironment = readSupabaseEnvironment();

console.log(`
  Pile prete.

    Front           http://localhost:5173
    API             http://localhost:3000
    Studio Supabase http://localhost:54323

  Ctrl+C arrete l API et le front. Le broker et la base restent debout ;
  npm run down les arrete.
`);

// The application on top. `npm run dev` already manages its two processes and their shutdown;
// reproducing it here would make two implementations of the same thing.
const application = spawn(npmCommand, ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, ...supabaseEnvironment, REDIS_URL },
});

application.once('error', error => {
    fail("Impossible de demarrer l application", error.message);
});

application.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal === null ? 0 : 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        if (application.exitCode === null && application.signalCode === null) {
            application.kill(signal);
        }
    });
}
