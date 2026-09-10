import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './items-api';
import { guardSession } from './guard-session';

const COMPTE = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };

function clientQuiEchoue(error: Error) {
    return { lire: () => Promise.reject(error) };
}

describe('guardSession', () => {
    it('signale la fin de session sur un refus 401', async () => {
        const expire = vi.fn();
        const client = guardSession(clientQuiEchoue(new ApiError(401, 'expiree')), expire);

        await expect(client.lire()).rejects.toBeInstanceOf(ApiError);

        expect(expire).toHaveBeenCalledOnce();
    });

    // Une panne du serveur n est pas une session terminee. Confondre les deux
    // renverrait la personne a l ecran de connexion pour une indisponibilite
    // d une seconde, en lui faisant perdre ce qu elle etait en train de faire.
    it('ne signale rien sur une autre erreur', async () => {
        const expire = vi.fn();
        const client = guardSession(clientQuiEchoue(new ApiError(500, 'panne')), expire);

        await expect(client.lire()).rejects.toBeInstanceOf(ApiError);

        expect(expire).not.toHaveBeenCalled();
    });

    it('ne signale rien sur une requete annulee', async () => {
        const expire = vi.fn();
        const abandon = new DOMException('abandon', 'AbortError');
        const client = guardSession(clientQuiEchoue(abandon), expire);

        await expect(client.lire()).rejects.toBe(abandon);

        expect(expire).not.toHaveBeenCalled();
    });

    // L appelant garde son erreur : c est lui qui sait quoi en dire a l ecran
    // qu il occupe, et la fin de session n est pas la seule chose a rapporter.
    it('laisse l erreur remonter a l appelant', async () => {
        const client = guardSession(clientQuiEchoue(new ApiError(401, 'expiree')), vi.fn());

        await expect(client.lire()).rejects.toThrow('expiree');
    });

    it('rend le resultat d un appel qui reussit, inchange', async () => {
        const client = guardSession({ lire: () => Promise.resolve(COMPTE) }, vi.fn());

        await expect(client.lire()).resolves.toEqual(COMPTE);
    });

    it('transmet les arguments de l appel', async () => {
        const lire = vi.fn(async (id: string) => id);
        const client = guardSession({ lire }, vi.fn());

        await client.lire('un-identifiant');

        expect(lire).toHaveBeenCalledWith('un-identifiant');
    });
});
