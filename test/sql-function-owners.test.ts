import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Two branches that change the same SQL function cannot see each other.
//
// Each adds a migration with `create or replace function`, Git reports no
// conflict -- the files are different -- and the last one applied replaces the
// other without leaving any trace of what it dropped.
//
// It happened. `20260908083028` (#152) put the creation of a new account's
// default project inside mirror_auth_user. `20260910110000` (#201) recomposed
// the same function to add the consent columns, starting from the version it
// knew: the one from before #152. An account created after that migration no
// longer got a default project, and nothing said so.
//
// The registry below is the shared line Git needs in order to see it. A
// migration that redefines a function makes this test fail until the registry
// names it, and two branches redefining the same function edit the same line,
// so the merge stops. That is the signal that was missing between #152 and
// #201.
//
// Updating a line here is not a chore to work around: it is the moment to read
// the definition being replaced and decide what carries over.

const OWNERS: Readonly<Record<string, string>> = {
    'public.create_item_with_event': '20260910221142_item_priority_due_date',
    'public.create_project_for_owner': '20260908083028_add_projects_and_memberships',
    'public.erase_account': '20260908144244_extend_account_erasure_for_projects',
    'public.mark_notification_read': '20260910100000_notification_policies_and_pagination',
    'public.mirror_auth_user': '20260910120000_mirror_auth_user_keeps_consent_and_default_project',
    'public.record_item_created_notification': '20260910090000_notify_in_one_transaction',
    'public.set_updated_at': '20260903120000_initial_schema',
    'public.uuid_generate_v7': '20260903120000_initial_schema',
};

const DOSSIER = join(import.meta.dirname, '..', 'supabase', 'migrations');

// Both spellings: the first definition of a function is usually a plain
// `create function`, and only later ones say `or replace`.
const DEFINITION = /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_.]+)\s*\(/giu;

function migrations(): readonly string[] {
    return readdirSync(DOSSIER)
        .filter(nom => nom.endsWith('.sql'))
        .sort();
}

// The migration that defines each function last, which is the one that decides
// what the schema actually holds. Migrations are applied in filename order, so
// sorting the names is the same order the database sees.
function derniersDefinisseurs(): Record<string, string> {
    const trouves: Record<string, string> = {};

    for (const nom of migrations()) {
        const source = readFileSync(join(DOSSIER, nom), 'utf8');
        for (const [, fonction] of source.matchAll(DEFINITION)) {
            if (fonction !== undefined) trouves[fonction] = nom.replace(/\.sql$/u, '');
        }
    }

    return trouves;
}

describe('le registre des fonctions SQL', () => {
    it('nomme la migration qui definit chaque fonction en dernier', () => {
        // Compared as a whole map rather than key by key: the diff then shows
        // which function moved and where, which is the question somebody
        // reading this failure has.
        expect(derniersDefinisseurs()).toEqual(OWNERS);
    });

    it('couvre des fonctions reellement redefinies, sans quoi il ne protegerait rien', () => {
        const compte: Record<string, number> = {};

        for (const nom of migrations()) {
            const source = readFileSync(join(DOSSIER, nom), 'utf8');
            for (const [, fonction] of source.matchAll(DEFINITION)) {
                if (fonction !== undefined) compte[fonction] = (compte[fonction] ?? 0) + 1;
            }
        }

        // mirror_auth_user, create_item_with_event and erase_account are the
        // three that already carry more than one definition. A registry over a
        // schema where nothing is ever redefined would pass while guarding
        // nothing, so this says out loud that the risk is real here.
        const redefinies = Object.entries(compte)
            .filter(([, fois]) => fois > 1)
            .map(([fonction]) => fonction)
            .sort();

        expect(redefinies).toEqual([
            'public.create_item_with_event',
            'public.erase_account',
            'public.mirror_auth_user',
        ]);
    });
});
