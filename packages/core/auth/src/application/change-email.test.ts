import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { InvalidEmailAddress } from '../domain/account.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedCaller } from './authenticated-caller.js';
import { makeChangeEmail } from './change-email.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const NEUVE = 'alice.neuf@example.com';

async function callerOf(provider: IdentityProvider): Promise<AuthenticatedCaller> {
    const session = await provider.authenticate(ADRESSE, MOT_DE_PASSE);

    return {
        account: session?.account ?? { id: 'account-1', email: ADRESSE },
        accessToken: session?.accessToken ?? '',
        refreshToken: session?.refreshToken ?? '',
    };
}

function contexte(seed = [{ id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE }]) {
    const provider = inMemoryIdentityProvider(seed);

    return { provider, changeEmail: makeChangeEmail(provider), signIn: makeSignIn(provider) };
}

describe('changeEmail', () => {
    it('demande une confirmation et ne touche pas encore a l identifiant', async () => {
        const { provider, changeEmail, signIn } = contexte();
        const caller = await callerOf(provider);

        await changeEmail(caller, NEUVE);

        expect(provider.emailChangeTokenFor(ADRESSE)).toEqual(expect.any(String));
        await expect(signIn(ADRESSE, MOT_DE_PASSE)).resolves.toBeDefined();
    });

    // Le critere central : une adresse deja enregistree produit la meme reponse
    // qu une adresse libre. Le cas d usage ne rend rien, donc les deux appels
    // sont indiscernables de l exterieur ; ici on verifie qu aucun ne leve.
    it('repond de la meme facon sur une adresse libre et sur une adresse prise', async () => {
        const { provider, changeEmail } = contexte([
            { id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE },
            { id: 'account-2', email: 'bob@example.com', password: 'AutreMotDePasse3' },
        ]);
        const caller = await callerOf(provider);

        const surLibre = await changeEmail(caller, NEUVE).then(
            () => 'ok',
            () => 'throw',
        );
        const surPrise = await changeEmail(caller, 'bob@example.com').then(
            () => 'ok',
            () => 'throw',
        );

        expect(surPrise).toBe(surLibre);
    });

    it('refuse une adresse qui n en est pas une', async () => {
        const { provider, changeEmail } = contexte();
        const caller = await callerOf(provider);

        await expect(changeEmail(caller, 'pas-une-adresse')).rejects.toBeInstanceOf(InvalidEmailAddress);
    });

    it('canonicalise la nouvelle adresse avant de la transmettre', async () => {
        const { provider, changeEmail } = contexte();
        const caller = await callerOf(provider);

        await changeEmail(caller, '  Alice.Neuf@Example.COM ');

        // Le fournisseur a recu la forme canonique : confirmer bascule vers elle.
        await provider.confirmEmailChange(provider.emailChangeTokenFor(ADRESSE) ?? '');
        expect(provider.emailChangeTokenFor(NEUVE)).toBeUndefined();
        await expect(makeSignIn(provider)(NEUVE, MOT_DE_PASSE)).resolves.toBeDefined();
    });
});
