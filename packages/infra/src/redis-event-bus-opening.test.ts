import { describe, expect, it, vi } from 'vitest';

import { opener } from './redis-event-bus.js';

// Le defaut que ceci ferme : une fonction serverless n appelle jamais connect(),
// donc chaque commande partait sur un client ferme et echouait. La passe de
// livraison attrapait l erreur, servait ce qui etait stocke, et aucune
// notification n apparaissait sur le deploiement.

describe('l ouverture a la demande du bus', () => {
    it('ouvre un client ferme', async () => {
        const connect = vi.fn(async () => undefined);
        const ouvrir = opener({ isOpen: false, connect });

        await ouvrir();

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('ne rouvre pas un client deja ouvert', async () => {
        const connect = vi.fn(async () => undefined);
        const ouvrir = opener({ isOpen: true, connect });

        await ouvrir();

        expect(connect).not.toHaveBeenCalled();
    });

    // node-redis rejette un second connect() pendant le premier : deux
    // commandes concurrentes sur un client ferme doivent partager l attente.
    it('ne lance qu une ouverture pour deux commandes concurrentes', async () => {
        let liberer: () => void = () => undefined;
        const connect = vi.fn(
            () =>
                new Promise<undefined>(resolve => {
                    liberer = () => resolve(undefined);
                }),
        );
        const ouvrir = opener({ isOpen: false, connect });

        const premiere = ouvrir();
        const seconde = ouvrir();
        liberer();
        await Promise.all([premiere, seconde]);

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('retente apres un echec, plutot que de rester bloque', async () => {
        const connect = vi
            .fn<() => Promise<undefined>>()
            .mockRejectedValueOnce(new Error('courtier injoignable'))
            .mockResolvedValueOnce(undefined);
        const ouvrir = opener({ isOpen: false, connect });

        await expect(ouvrir()).rejects.toThrow('courtier injoignable');
        await expect(ouvrir()).resolves.toBeUndefined();

        expect(connect).toHaveBeenCalledTimes(2);
    });
});
