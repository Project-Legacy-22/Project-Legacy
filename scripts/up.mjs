// Une seule commande demarre tout : le broker, la base et l application.
//
// Trois etages a lancer dans l ordre, parce que chacun depend du precedent.
// Le broker est declare dans compose.yaml ; la pile Supabase est orchestree par
// son propre CLI, qui applique aussi les migrations. Le script enchaine les
// deux, puis transmet a l application les coordonnees que le CLI vient
// d imprimer : c est ce qui supprime la copie manuelle de .env, qui etait la
// seule etape a la main du parcours de demarrage.
//
// Chaque etape est idempotente. Relancer la commande sur une pile deja debout
// ne casse rien et ne repart pas de zero : les donnees de developpement
// survivent au redemarrage.

import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Ce que l API attend, et d ou cela vient dans la sortie du CLI Supabase.
const REQUIRED = { SUPABASE_URL: 'API_URL', SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY' };

// Le broker ecoute sur la boucle locale. Le port par defaut est celui de Redis ;
// un poste qui en fait deja tourner un le surcharge par REDIS_PORT, sans quoi
// la publication du port echouerait au demarrage. La meme valeur sert a
// compose.yaml et a l URL transmise a l application, pour que les deux ne
// puissent pas diverger.
const redisPort = process.env.REDIS_PORT ?? '6379';
const REDIS_URL = `redis://127.0.0.1:${redisPort}`;

function fail(message, detail) {
    console.error(`\n  ${message}\n`);
    if (detail) console.error(`${detail}\n`);
    process.exit(1);
}

// Une etape d infrastructure : elle doit reussir, sa sortie va au terminal.
// `hint` porte ce que l utilisateur peut faire quand elle echoue, quand la
// sortie de la commande ne le dit pas d elle-meme.
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

    // Format `CLE="valeur"`, une par ligne. Les guillemets sont retires ; une
    // valeur peut contenir des `=`, d ou la limite sur la premiere occurrence.
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
        // Nommer ce qui manque plutot que de laisser l API refuser de demarrer
        // plus loin avec une erreur qui ne designerait pas la vraie cause.
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

// L application par-dessus. `npm run dev` gere deja ses deux processus et leur
// arret ; le reproduire ici ferait deux implementations du meme sujet.
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
