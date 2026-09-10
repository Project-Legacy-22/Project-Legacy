import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Express, IRouter } from 'express';
import { describe, expect, it } from 'vitest';

import { recordingLogger } from '../../../../packages/contracts/test/fakes/recording-logger.js';
import { makeAppUseCases } from '../../test/fakes/app-use-cases.js';
import { testConfig } from '../../test/http-harness.js';
import { createServer } from './server.js';

// Two files have to say the same thing, and nothing made them.
//
// The API mounts its routes in server.ts. vercel.json decides which paths the
// platform hands to the serverless function at all: anything it does not
// rewrite is looked up among the static files, and answered with Vercel's own
// 404 -- not ours. A route the application serves and the rewrites ignore is
// therefore unreachable once deployed, while every test here stays green,
// because a test queries Express directly and never crosses the platform.
//
// It happened, and it cost the whole projects surface: /projects was added with
// the projects domain and never added to the rewrites. GET /projects?limit=20
// answered `x-vercel-error: NOT_FOUND` on the deployment while 529 tests
// passed. GET /reset-password, the link people follow out of a password reset
// e-mail, was in the same state.
//
// The list is read from the running application rather than typed out again
// here, because a second hand-written list is one more thing to forget.

const RACINE = join(import.meta.dirname, '..', '..', '..', '..');

function application(): Express {
    return createServer(testConfig, makeAppUseCases(), recordingLogger());
}

// Express 5 exposes the mounted stack. A nested router -- the items routes live
// under one -- appears as a layer whose handle carries its own stack.
function cheminsServis(app: Express): readonly string[] {
    const trouves = new Set<string>();

    const parcourir = (pile: IRouter['stack']): void => {
        for (const couche of pile) {
            if (couche.route !== undefined) {
                const chemin: unknown = couche.route.path;
                if (typeof chemin === 'string') trouves.add(chemin);
                continue;
            }

            const imbrique = (couche.handle as Partial<IRouter> | undefined)?.stack;
            if (imbrique !== undefined) parcourir(imbrique);
        }
    };

    parcourir(app.router.stack);
    return [...trouves].sort();
}

// A concrete request path, since a rewrite matches paths and not patterns.
function cheminSansParametres(chemin: string): string {
    return chemin.replaceAll(/\/:[^/]+/gu, '/x');
}

function reecritures(): readonly { source: string; motif: RegExp }[] {
    const contenu: unknown = JSON.parse(readFileSync(join(RACINE, 'vercel.json'), 'utf8'));
    const brutes = (contenu as { rewrites?: { source?: unknown }[] }).rewrites;
    if (brutes === undefined) throw new Error('vercel.json declares no rewrites');

    return brutes.map(entree => {
        const source = String(entree.source);
        return { source, motif: new RegExp(`^${source}$`, 'u') };
    });
}

describe('les reecritures de vercel.json et les routes de l API', () => {
    it('rendent joignable chaque route que l application sert', () => {
        const motifs = reecritures();

        const injoignables = cheminsServis(application())
            .filter(chemin => !motifs.some(({ motif }) => motif.test(cheminSansParametres(chemin))))
            .sort();

        expect(injoignables).toEqual([]);
    });

    it('ne declarent aucune reecriture que rien ne sert', () => {
        // A dead entry is not harmless: it says a path is served when it is
        // not, so the next person reads the file and concludes the platform
        // side is done. /items sat there for a week after its routes moved
        // under /projects.
        const servis = cheminsServis(application()).map(cheminSansParametres);

        const mortes = reecritures()
            .filter(({ motif }) => !servis.some(chemin => motif.test(chemin)))
            .map(({ source }) => source)
            .sort();

        expect(mortes).toEqual([]);
    });

    it('portent sur un ensemble non vide, sans quoi les deux tests ci-dessus passeraient pour rien', () => {
        // Both readers depend on a shape either file could lose: a renamed key
        // in vercel.json, a change in how Express exposes its stack. Two empty
        // sets compare equal and prove nothing.
        expect(cheminsServis(application()).length).toBeGreaterThan(8);
        expect(reecritures().length).toBeGreaterThan(2);
    });
});
