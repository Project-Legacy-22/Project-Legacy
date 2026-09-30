import { describe, expect, it } from 'vitest';

import { anAccountWithData } from '../../test/builders/personal-data.js';
import type { SeededAccount } from '../../test/fakes/in-memory-personal-data-store.js';
import { inMemoryPersonalDataStore } from '../../test/fakes/in-memory-personal-data-store.js';
import { AccountNotFound } from '../domain/account.js';
import { makeExportPersonalData } from './export-personal-data.js';

const MOMENT = new Date('2026-09-08T12:00:00.000Z');
const ALICE = anAccountWithData('alice@example.com', 1);
const BOB = anAccountWithData('bob@example.com', 2);

function exportateurSur(comptes: SeededAccount[]) {
    return makeExportPersonalData({
        store: inMemoryPersonalDataStore(comptes),
        now: () => MOMENT,
    });
}

describe('exportPersonalData', () => {
    it('returns the account, its projects, its memberships, its items and its notifications', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.account).toEqual(ALICE.account);
        expect(copie.projects).toEqual(ALICE.projects);
        expect(copie.projectMemberships).toEqual(ALICE.projectMemberships);
        expect(copie.items).toEqual(ALICE.items);
        expect(copie.notifications).toEqual(ALICE.notifications);
    });

    // The portability criterion of US-13: an export reduced to the account fails the issue. The
    // answer must cover every table where the application holds data, not only the one that carries
    // the address.
    it('covers every table that holds data of the account', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.projects).not.toHaveLength(0);
        expect(copie.projectMemberships).not.toHaveLength(0);
        expect(copie.items).not.toHaveLength(0);
        expect(copie.notifications).not.toHaveLength(0);
    });

    // The second criterion of US-13, checked on the serialised document and not field by field:
    // that file is what the person receives, so it is the one that must hold no trace of another
    // account.
    it('lets no data of another account through', async () => {
        const exportPersonalData = exportateurSur([ALICE, BOB]);

        const document = JSON.stringify(await exportPersonalData(ALICE.account.id));

        expect(document).not.toContain(BOB.account.email);
        expect(document).not.toContain(BOB.account.id);
        expect(document).not.toContain(BOB.projectId);
        expect(document).not.toContain(BOB.itemId);
        expect(document).not.toContain(BOB.notificationId);
    });

    it('dates the copy from the moment it is taken', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.exportedAt).toBe(MOMENT.toISOString());
    });

    // A valid session on an account of which nothing remains signals a drift between the two
    // stores. An empty export would present it as a person who owns nothing, which is false and
    // undetectable.
    it('refuses to export an account the store knows nothing about', async () => {
        const exportPersonalData = exportateurSur([BOB]);

        await expect(exportPersonalData(ALICE.account.id)).rejects.toBeInstanceOf(AccountNotFound);
    });
});
