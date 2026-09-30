import { describe, expect, it } from 'vitest';

import { aProject, aProjectMembership, anAccountWithData, anItem } from '../../test/builders/personal-data.js';
import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../test/fakes/in-memory-personal-data-store.js';
import type { InMemoryPersonalDataStore, SeededAccount } from '../../test/fakes/in-memory-personal-data-store.js';
import { ErasureNotConfirmed } from '../domain/account.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import { makeEraseAccount } from './erase-account.js';

const MOT_DE_PASSE = 'MotDePasse2026';
const ALICE = anAccountWithData('alice@example.com', 1);
const BOB = anAccountWithData('bob@example.com', 2);

interface Contexte {
    eraseAccount: ReturnType<typeof makeEraseAccount>;
    store: InMemoryPersonalDataStore;
    identity: IdentityProvider;
}

function contexte(seed: SeededAccount[] = [ALICE, BOB]): Contexte {
    const store = inMemoryPersonalDataStore(seed);
    const identity = inMemoryIdentityProvider(
        [ALICE, BOB].map((compte) => ({
            id: compte.account.id,
            email: compte.account.email,
            password: MOT_DE_PASSE,
        })),
    );

    return {
        eraseAccount: makeEraseAccount({ store, identity }),
        store,
        identity,
    };
}

describe('eraseAccount', () => {
    // The central criterion of US-13: after the deletion, no row carries the account identifier any
    // more. It is stated on the tables and not on a method of the store, because that is what the
    // migration promises.
    it('leaves no row carrying the account identifier', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.rowsMentioning(ALICE.account.id)).toEqual([]);
    });

    // The outbox and processed_events are named explicitly by the issue. The latter carries no
    // account identifier: the only way to know whether its row is gone is to designate it by the
    // event that created it.
    it('erases the events produced by the account and the record of their processing', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.hasProcessedEvent(ALICE.eventId)).toBe(false);
    });

    it('leaves the data of other accounts intact', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.rowsMentioning(BOB.account.id)).toEqual([
            'users',
            'items',
            'notifications',
            'outbox',
            'project_memberships',
        ]);
        expect(store.hasProcessedEvent(BOB.eventId)).toBe(true);
    });

    it('erases a project whose last member was the account, and its items', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.hasProject(ALICE.projectId)).toBe(false);
        expect(store.hasItem(ALICE.itemId)).toBe(false);
    });

    it('keeps a shared project and only removes the account\'s membership', async () => {
        const sharedProjectId = '01996f00-0000-7000-8000-0000000000d9';
        const sharedItemId = '01996f00-0000-7000-8000-0000000000a9';
        const project = aProject({ id: sharedProjectId, name: 'Shared project' });
        const alice = {
            ...ALICE,
            projects: [...(ALICE.projects ?? []), project],
            projectMemberships: [
                ...(ALICE.projectMemberships ?? []),
                aProjectMembership({ projectId: sharedProjectId, role: 'member' }),
            ],
        };
        const bob = {
            ...BOB,
            projects: [...(BOB.projects ?? []), project],
            projectMemberships: [
                ...(BOB.projectMemberships ?? []),
                aProjectMembership({ projectId: sharedProjectId, role: 'owner' }),
            ],
            items: [...(BOB.items ?? []), anItem({ id: sharedItemId, projectId: sharedProjectId })],
        };
        const { eraseAccount, store } = contexte([alice, bob]);

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.hasProject(sharedProjectId)).toBe(true);
        expect(store.hasMembership(sharedProjectId, ALICE.account.id)).toBe(false);
        expect(store.hasMembership(sharedProjectId, BOB.account.id)).toBe(true);
        expect(store.hasItem(sharedItemId)).toBe(true);
    });

    // The deletion revokes every session. The token goes through identify() rather than being
    // compared with a string: the behaviour is what matters, not the shape of the token the double
    // builds.
    it('revokes the sessions the account opened', async () => {
        const { eraseAccount, identity } = contexte();
        const session = await identity.authenticate(ALICE.account.email, MOT_DE_PASSE);
        const jeton = session?.accessToken ?? '';

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(await identity.identify(jeton)).toBeUndefined();
    });

    it('refuses a deletion that the account\'s address does not confirm', async () => {
        const { eraseAccount } = contexte();

        const refus = eraseAccount(ALICE.account, BOB.account.email);

        await expect(refus).rejects.toBeInstanceOf(ErasureNotConfirmed);
    });

    // A refused confirmation must have erased nothing. Without this assertion, instructions in the
    // reverse order would pass the previous test while having already deleted the rows.
    it('erases nothing when the confirmation does not match', async () => {
        const { eraseAccount, store } = contexte();

        await expect(eraseAccount(ALICE.account, BOB.account.email)).rejects.toThrow();

        expect(store.rowsMentioning(ALICE.account.id)).not.toEqual([]);
    });

    // The confirmation proves an intent, it does not test typing: the same address typed with a
    // capital letter or a space is still the same address.
    it('accepts a confirmation that differs in case or spacing', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, `  ${ALICE.account.email.toUpperCase()} `);

        expect(store.rowsMentioning(ALICE.account.id)).toEqual([]);
    });
});
