import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { renderOpenApi } from './document.js';

// `npm run docs:api` writes the document the openapi test compares with. The
// file is committed, so a change to a contract shows up in the diff of the
// pull request that makes it.
const target = join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'api', 'openapi.json');

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderOpenApi());
process.stdout.write(`written ${target}\n`);
