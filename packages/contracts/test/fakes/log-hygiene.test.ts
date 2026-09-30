import { describe, expect, it } from 'vitest';

import { refusePersonalData } from './log-hygiene.js';
import { recordingLogger } from './recording-logger.js';

// Un garde se juge dans les deux sens. Celui-ci refuse ce qu'il doit refuser,
// et laisse passer ce qui n'est pas une donnee personnelle : un controle qui
// crie a tort finit desarme, et celui-la protege une regle qui ne doit pas
// l'etre.
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';

// Base64url d'un petit objet JSON, exactement comme le curseur de pagination
// que ce depot fabrique. Il commence par les memes trois caracteres qu'un jeton
// signe, et n'en est pas un.
const CURSOR = Buffer.from(JSON.stringify({ position: 3, priority: 'high' }), 'utf8').toString(
    'base64url',
);

const SIGNED_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.3Ql-signature-part';

describe('refusePersonalData, ce qui est refuse', () => {
    it('refuse une adresse ecrite dans un champ', () => {
        expect(() => refusePersonalData({ user: 'alice@example.com' }, undefined)).toThrow(
            /email address/u,
        );
    });

    // Le chemin le plus probable : personne n'ecrit une adresse volontairement,
    // elle arrive dans le message d'une erreur remontee telle quelle.
    it('refuse une adresse cachee dans le message d une erreur', () => {
        const error = new Error('no account for bob@example.org');

        expect(() => refusePersonalData({ err: error }, 'unhandled failure')).toThrow(
            /email address/u,
        );
    });

    it('refuse un jeton signe', () => {
        expect(() => refusePersonalData({ session: SIGNED_TOKEN }, undefined)).toThrow(
            /JSON Web Token/u,
        );
    });

    // Un champ dont le nom annonce un secret n'a pas besoin d'etre reconnu par
    // sa forme : sa valeur en clair suffit a le condamner.
    it('refuse un champ de justificatif ecrit en clair, quelle que soit sa forme', () => {
        expect(() => refusePersonalData({ recoveryToken: 'court-et-opaque' }, undefined)).toThrow(
            /credential field/u,
        );
    });

    it('refuse une adresse au fond d une structure imbriquee', () => {
        expect(() =>
            refusePersonalData({ request: { actor: { contact: 'carol@example.net' } } }, undefined),
        ).toThrow(/request\.actor\.contact/u);
    });
});

describe('refusePersonalData, ce qui passe', () => {
    it('laisse passer des identifiants', () => {
        expect(() =>
            refusePersonalData({ accountId: ACCOUNT_ID, traceId: 'trace-1', status: 500 }, 'failed'),
        ).not.toThrow();
    });

    // Le faux positif que ce garde a produit a sa premiere execution, et la
    // raison pour laquelle il ne reconnait plus un jeton a ses trois premiers
    // caracteres.
    it('laisse passer un curseur de pagination', () => {
        expect(() =>
            refusePersonalData({ path: `/items?limit=1&cursor=${CURSOR}` }, undefined),
        ).not.toThrow();
    });

    it('laisse passer un champ deja masque', () => {
        expect(() => refusePersonalData({ password: '[redacted]' }, undefined)).not.toThrow();
    });
});

describe('le logger d essai', () => {
    it('applique le garde a chaque ligne, sans que le test ait a y penser', () => {
        const logger = recordingLogger();

        expect(() => logger.error({ email: 'dave@example.com' }, 'boom')).toThrow(/EN-40/u);
        expect(logger.lines).toHaveLength(0);
    });

    it('enregistre normalement une ligne qui ne porte que des identifiants', () => {
        const logger = recordingLogger();

        logger.info({ accountId: ACCOUNT_ID, traceId: 'trace-2' }, 'account read');

        expect(logger.lines).toHaveLength(1);
    });
});
