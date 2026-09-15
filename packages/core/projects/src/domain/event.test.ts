import { describe, expect, it } from 'vitest';

import { MEMBERSHIP_CREATED_V1, membershipCreated } from './event.js';

const OCCURRED_AT = new Date('2026-09-15T10:00:00.000Z');
const PROJET = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const MEMBRE = '0191f3c2-2222-7000-8000-bbbbbbbbbbbb';
const AJOUTE_PAR = '0191f3c2-3333-7000-8000-cccccccccccc';

describe('membershipCreated', () => {
    it('porte les trois identifiants et l instant, sans rien de plus', () => {
        expect(
            membershipCreated('event-id', OCCURRED_AT, {
                projectId: PROJET,
                memberId: MEMBRE,
                addedBy: AJOUTE_PAR,
            }),
        ).toEqual({
            id: 'event-id',
            name: MEMBERSHIP_CREATED_V1,
            occurredAt: '2026-09-15T10:00:00.000Z',
            payload: { projectId: PROJET, memberId: MEMBRE, addedBy: AJOUTE_PAR },
        });
    });

    // Le meme critere RGPD que pour la creation d une tache. L adresse est ce
    // que la personne a tape pour trouver le compte, donc du contenu : si elle
    // entrait dans le payload, elle sortirait du perimetre que l export et
    // l effacement savent atteindre, et se retrouverait dans les journaux du
    // consommateur.
    it('ne transporte aucune adresse', () => {
        const event = membershipCreated('event-id', OCCURRED_AT, {
            projectId: PROJET,
            memberId: MEMBRE,
            addedBy: AJOUTE_PAR,
        });

        expect(Object.keys(event.payload)).toEqual(['projectId', 'memberId', 'addedBy']);
        expect(JSON.stringify(event)).not.toContain('@');
    });

    // `addedBy` est la raison pour laquelle l invitation passe par le flux :
    // sans lui, la notification pourrait dire « ajoute » mais pas « par qui ».
    it('nomme qui a ajoute, et pas seulement qui a ete ajoute', () => {
        const event = membershipCreated('event-id', OCCURRED_AT, {
            projectId: PROJET,
            memberId: MEMBRE,
            addedBy: AJOUTE_PAR,
        });

        expect(event.payload.addedBy).toBe(AJOUTE_PAR);
        expect(event.payload.addedBy).not.toBe(event.payload.memberId);
    });

    it('porte un nom versionne, pour qu un consommateur s abonne a une forme precise', () => {
        expect(
            membershipCreated('event-id', OCCURRED_AT, {
                projectId: PROJET,
                memberId: MEMBRE,
                addedBy: AJOUTE_PAR,
            }).name,
        ).toBe('membership.created.v1');
    });
});
