// tsc only emits the compiled .ts files. The legacy front-end assets live in
// apps/api/src/static and are served from `staticDir` in the config, which
// resolves next to the running code, so they have to be copied next to the
// compiled output for the built server to find them.
import { cpSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const from = join(projectRoot, 'apps', 'api', 'src', 'static');
const to = join(projectRoot, 'apps', 'api', 'dist', 'static');

cpSync(from, to, { recursive: true });
