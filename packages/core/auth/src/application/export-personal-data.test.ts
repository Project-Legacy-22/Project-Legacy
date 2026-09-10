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
    it('rend le compte, ses projets, ses appartenances, ses items et ses notifications', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.account).toEqual(ALICE.account);
        expect(copie.projects).toEqual(ALICE.projects);
        expect(copie.projectMemberships).toEqual(ALICE.projectMemberships);
        expect(copie.items).toEqual(ALICE.items);
        expect(copie.notifications).toEqual(ALICE.notifications);
    });

    // Le critere de portabilite de US-13 : un export reduit au compte est un
    // echec de l issue. La reponse doit couvrir les tables ou l application
    // detient de la donnee, pas seulement celle qui porte l adresse.
    it('couvre toutes les tables qui portent une donnee du compte', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.projects).not.toHaveLength(0);
        expect(copie.projectMemberships).not.toHaveLength(0);
        expect(copie.items).not.toHaveLength(0);
        expect(copie.notifications).not.toHaveLength(0);
    });

    // Le second critere de US-13, verifie sur le document serialise et non sur
    // ses champs un par un : c est ce fichier que la personne recoit, et c est
    // donc lui qui ne doit contenir aucune trace d un autre compte.
    it('ne laisse passer aucune donnee d un autre compte', async () => {
        const exportPersonalData = exportateurSur([ALICE, BOB]);

        const document = JSON.stringify(await exportPersonalData(ALICE.account.id));

        expect(document).not.toContain(BOB.account.email);
        expect(document).not.toContain(BOB.account.id);
        expect(document).not.toContain(BOB.projectId);
        expect(document).not.toContain(BOB.itemId);
        expect(document).not.toContain(BOB.notificationId);
    });

    it('date la copie du moment ou elle est prise', async () => {
        const exportPersonalData = exportateurSur([ALICE]);

        const copie = await exportPersonalData(ALICE.account.id);

        expect(copie.exportedAt).toBe(MOMENT.toISOString());
    });

    // Une session valide sur un compte dont il ne reste rien signale une derive
    // entre les deux magasins. Un export vide la presenterait comme une
    // personne qui ne possede rien, ce qui est faux et indetectable.
    it('refuse d exporter un compte dont le magasin ne sait rien', async () => {
        const exportPersonalData = exportateurSur([BOB]);

        await expect(exportPersonalData(ALICE.account.id)).rejects.toBeInstanceOf(AccountNotFound);
    });
});
