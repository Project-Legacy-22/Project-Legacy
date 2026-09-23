import { describe, expect, it } from 'vitest';

import { anItem } from '../../test/builders/item.js';
import { inMemoryAttentionReader } from '../../test/fakes/in-memory-attention-reader.js';
import type { SeededProject } from '../../test/fakes/in-memory-attention-reader.js';
import { ATTENTION_GROUP_LIMIT, InvalidAttentionDate } from '../domain/attention.js';
import type { Item } from '../domain/item.js';
import { makeListAttention } from './list-attention.js';

const ADA = 'user-ada';
const ALAN = 'user-alan';
const TODAY = '2026-09-23';
const ADA_PROJECT: SeededProject = { id: 'project-ada', name: 'Ada', memberIds: [ADA] };
const ALAN_PROJECT: SeededProject = { id: 'project-alan', name: 'Alan', memberIds: [ALAN] };
const SHARED_PROJECT: SeededProject = { id: 'project-shared', name: 'Shared', memberIds: [ADA, ALAN] };

function listAttentionOver(items: Item[], projects: SeededProject[] = [ADA_PROJECT, ALAN_PROJECT, SHARED_PROJECT]) {
    return makeListAttention(inMemoryAttentionReader(items, projects));
}

function idsOf(group: { entries: { item: Item }[] }): string[] {
    return group.entries.map((entry) => entry.item.id);
}

describe('listAttention', () => {
    it('repartit les taches ouvertes de la personne entre retard, echeance proche et priorite', async () => {
        const listAttention = listAttentionOver([
            anItem({ id: 'late', projectId: ADA_PROJECT.id, dueDate: '2026-09-20' }),
            anItem({ id: 'tomorrow', projectId: ADA_PROJECT.id, dueDate: '2026-09-24' }),
            anItem({ id: 'urgent', projectId: ADA_PROJECT.id, priority: 'high' }),
            anItem({ id: 'quiet', projectId: ADA_PROJECT.id }),
        ]);

        const attention = await listAttention(ADA, TODAY);

        expect([idsOf(attention.overdue), idsOf(attention.dueSoon), idsOf(attention.highPriority)]).toEqual([
            ['late'],
            ['tomorrow'],
            ['urgent'],
        ]);
    });

    it('ne montre rien d un projet dont la personne n est pas membre', async () => {
        const listAttention = listAttentionOver([
            anItem({ id: 'mine', projectId: ADA_PROJECT.id, dueDate: '2026-09-20' }),
            anItem({ id: 'theirs', projectId: ALAN_PROJECT.id, dueDate: '2026-09-20' }),
        ]);

        const attention = await listAttention(ADA, TODAY);

        // La sienne presente autant que l autre absente : un filtre qui ne
        // renverrait rien passerait sinon ce test.
        expect(idsOf(attention.overdue)).toEqual(['mine']);
    });

    it('montre les taches d un projet partage, creees par un autre membre, avec le nom du projet', async () => {
        const listAttention = listAttentionOver([
            anItem({ id: 'by-alan', projectId: SHARED_PROJECT.id, ownerId: ALAN, priority: 'high' }),
        ]);

        const attention = await listAttention(ADA, TODAY);

        expect(attention.highPriority.entries).toEqual([
            { item: expect.objectContaining({ id: 'by-alan' }) as unknown, projectName: 'Shared' },
        ]);
    });

    it('borne chaque groupe et dit qu il en reste', async () => {
        const late = Array.from({ length: ATTENTION_GROUP_LIMIT + 1 }, (_, index) =>
            anItem({ id: `late-${String(index).padStart(2, '0')}`, projectId: ADA_PROJECT.id, dueDate: '2026-09-01' }),
        );
        const listAttention = listAttentionOver(late);

        const attention = await listAttention(ADA, TODAY);

        expect(attention.overdue.entries).toHaveLength(ATTENTION_GROUP_LIMIT);
        expect(attention.overdue.hasMore).toBe(true);
    });

    it('dit qu il n y a rien quand la personne n a aucune tache', async () => {
        const listAttention = listAttentionOver([anItem({ projectId: ALAN_PROJECT.id, dueDate: '2026-09-01' })]);

        await expect(listAttention(ADA, TODAY)).resolves.toMatchObject({ workload: 'none' });
    });

    it('dit que tout est termine quand toutes ses taches le sont', async () => {
        const listAttention = listAttentionOver([
            anItem({ id: 'a', projectId: ADA_PROJECT.id, status: 'done', dueDate: '2026-09-01' }),
            anItem({ id: 'b', projectId: SHARED_PROJECT.id, status: 'done', priority: 'high' }),
        ]);

        await expect(listAttention(ADA, TODAY)).resolves.toMatchObject({ workload: 'all_done' });
    });

    it('distingue du travail ouvert mais rien d urgent de l absence de travail', async () => {
        const listAttention = listAttentionOver([anItem({ projectId: ADA_PROJECT.id, dueDate: '2026-10-15' })]);

        const attention = await listAttention(ADA, TODAY);

        expect(attention).toMatchObject({
            overdue: { entries: [] },
            dueSoon: { entries: [] },
            highPriority: { entries: [] },
            workload: 'open',
        });
    });

    it('refuse un jour qui n existe pas dans le calendrier', async () => {
        const listAttention = listAttentionOver([]);

        await expect(listAttention(ADA, '2026-02-30')).rejects.toBeInstanceOf(InvalidAttentionDate);
    });
});
