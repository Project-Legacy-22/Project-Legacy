// tsc only emits the compiled .ts files. The legacy front-end assets live in
// src/static and are served by index.ts from `import.meta.dirname + '/static'`,
// so they have to be copied next to the compiled output for the built server to
// resolve them the same way the source server does.
import { cpSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '..');
const from = join(projectRoot, 'src', 'static');
const to = join(projectRoot, 'dist', 'static');

cpSync(from, to, { recursive: true });
