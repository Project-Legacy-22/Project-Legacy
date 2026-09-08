import { describe, expect, it } from 'vitest';

import { anAccountWithData } from '../../test/builders/personal-data.js';
import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../test/fakes/in-memory-personal-data-store.js';
import type { InMemoryPersonalDataStore } from '../../test/fakes/in-memory-personal-data-store.js';
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

function contexte(): Contexte {
    const store = inMemoryPersonalDataStore([ALICE, BOB]);
    const identity = inMemoryIdentityProvider(
        [ALICE, BOB].map(compte => ({
            id: compte.account.id,
            email: compte.account.email,
            password: MOT_DE_PASSE,
        })),
    );

    return { eraseAccount: makeEraseAccount({ store, identity }), store, identity };
}

describe('eraseAccount', () => {
    // Le critere central de US-13 : apres la suppression, aucune ligne ne porte
    // plus l identifiant du compte. Il est enonce sur les tables et non sur une
    // methode du magasin, parce que c est ce que la migration promet.
    it('ne laisse aucune ligne portant l identifiant du compte', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.rowsMentioning(ALICE.account.id)).toEqual([]);
    });

    // L outbox et processed_events sont cites explicitement par l issue. La
    // seconde ne porte aucun identifiant de compte : la seule facon de savoir
    // si sa ligne a disparu est de la designer par l evenement qui l a creee.
    it('efface les evenements produits par le compte et leur trace de traitement', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.hasProcessedEvent(ALICE.eventId)).toBe(false);
    });

    it('laisse intactes les donnees des autres comptes', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(store.rowsMentioning(BOB.account.id)).toEqual([
            'users',
            'items',
            'notifications',
            'outbox',
        ]);
        expect(store.hasProcessedEvent(BOB.eventId)).toBe(true);
    });

    // La suppression revoque toutes les sessions. Le jeton est fait passer par
    // identify() plutot que compare a une chaine : c est le comportement qui
    // compte, pas la forme du jeton que la doublure fabrique.
    it('revoque les sessions ouvertes par le compte', async () => {
        const { eraseAccount, identity } = contexte();
        const session = await identity.authenticate(ALICE.account.email, MOT_DE_PASSE);
        const jeton = session?.accessToken ?? '';

        await eraseAccount(ALICE.account, ALICE.account.email);

        expect(await identity.identify(jeton)).toBeUndefined();
    });

    it('refuse une suppression que l adresse du compte ne confirme pas', async () => {
        const { eraseAccount } = contexte();

        const refus = eraseAccount(ALICE.account, BOB.account.email);

        await expect(refus).rejects.toBeInstanceOf(ErasureNotConfirmed);
    });

    // Une confirmation refusee doit ne rien avoir efface. Sans cette assertion,
    // un ordre d instructions inverse passerait le test precedent tout en ayant
    // deja supprime les lignes.
    it('n efface rien quand la confirmation ne correspond pas', async () => {
        const { eraseAccount, store } = contexte();

        await expect(eraseAccount(ALICE.account, BOB.account.email)).rejects.toThrow();

        expect(store.rowsMentioning(ALICE.account.id)).not.toEqual([]);
    });

    // La confirmation prouve une intention, elle ne teste pas la frappe : la
    // meme adresse saisie avec une majuscule ou un espace reste la meme adresse.
    it('accepte une confirmation dont la casse ou les espaces different', async () => {
        const { eraseAccount, store } = contexte();

        await eraseAccount(ALICE.account, `  ${ALICE.account.email.toUpperCase()} `);

        expect(store.rowsMentioning(ALICE.account.id)).toEqual([]);
    });
});
