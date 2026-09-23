import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttentionApi } from './api/attention-api';
import type { ItemsApi } from './api/items-api';
import { ApiError } from './api/items-api';
import type { ProjectDto } from './api/projects-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createProjectsApi, itemPage } from './test/app-fixture';
import { anAttention, anAttentionItem } from './test/builders/attention-builder';
import { anItem } from './test/builders/item-builder';
import { click, createReactTestRoot, flushTimers, getElement, tabbables, waitFor } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const HOME = '[aria-labelledby="home-heading"]';
const FIRST: ProjectDto = { id: '00000000-0000-7000-8000-000000000010', name: 'House', role: 'owner', itemCount: 1 };
const SECOND: ProjectDto = { id: '00000000-0000-7000-8000-000000000020', name: 'Work', role: 'member', itemCount: 1 };
const LATE = anItem({ id: '11111111-1111-4111-8111-111111111111', projectId: SECOND.id, name: 'File the report', dueDate: '2020-01-02' });

let root: ReactTestRoot;

async function renderApp(attention: AttentionApi, items: ItemsApi = createApi()): Promise<void> {
    await root.render(
        <App
            api={items}
            auth={createAuth()}
            projects={createProjectsApi({ listProjects: async () => ({ projects: [FIRST, SECOND], nextCursor: null }) })}
            attention={attention}
        />,
    );
    await flushTimers();
}

function homeText(): string {
    return getElement<HTMLElement>(HOME).textContent ?? '';
}

function rowNamed(name: string): HTMLButtonElement {
    const row = [...document.querySelectorAll<HTMLButtonElement>('.attention-row')].find((candidate) =>
        candidate.textContent?.includes(name),
    );
    if (row === undefined) throw new Error(`Attention row not found: ${name}`);
    return row;
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Legacy';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('home screen', () => {
    it('vient en premier apres la connexion, avant la liste des projets', async () => {
        await renderApp({ listAttention: async () => anAttention() });

        const sections = [...document.querySelectorAll('main > section')].map((section) =>
            section.getAttribute('aria-labelledby'),
        );

        expect(sections.slice(0, 2)).toEqual(['home-heading', 'projects-heading']);
    });

    it('montre les taches de chaque groupe avec le projet ou elles vivent', async () => {
        const attention = anAttention({
            workload: 'open',
            overdue: { items: [anAttentionItem({ ...LATE, projectName: SECOND.name })], hasMore: true },
        });
        await renderApp({ listAttention: async () => attention });

        expect(rowNamed('File the report').textContent).toContain(labels.attentionInProject('Work'));
        expect(homeText()).toContain(labels.attentionDueSoonEmpty);
        expect(homeText()).toContain(labels.attentionHasMore);
    });

    it('ouvre la tache dans son projet et y porte le focus', async () => {
        const listItems = vi.fn<ItemsApi['listItems']>(async (projectId) =>
            itemPage(projectId === SECOND.id ? [LATE] : []),
        );
        const attention = anAttention({ workload: 'open', overdue: { items: [anAttentionItem({ ...LATE, projectName: SECOND.name })], hasMore: false } });
        await renderApp({ listAttention: async () => attention }, createApi({ listItems }));
        const row = rowNamed('File the report');

        await click(row);
        await waitFor(() => document.activeElement?.getAttribute('data-move-item-id') === LATE.id);

        expect(tabbables()).toContain(row);
        expect(getElement('#items-heading').textContent).toContain(SECOND.name);
        expect(document.activeElement?.getAttribute('data-move-item-id')).toBe(LATE.id);
    });

    it('distingue un compte sans tache d un compte ou tout est termine', async () => {
        await renderApp({ listAttention: async () => anAttention({ workload: 'none' }) });
        const nothingYet = homeText();
        await root.unmount();
        root = createReactTestRoot();

        await renderApp({ listAttention: async () => anAttention({ workload: 'all_done' }) });

        expect(nothingYet).toContain(labels.attentionEmpty('none'));
        expect(homeText()).toContain(labels.attentionEmpty('all_done'));
    });

    it('signale un echec et recharge a la demande', async () => {
        const listAttention = vi
            .fn<AttentionApi['listAttention']>()
            .mockRejectedValueOnce(new ApiError(500, labels.loadAttentionFailed))
            .mockResolvedValue(anAttention({ workload: 'all_done' }));
        await renderApp({ listAttention });
        expect(getElement(`${HOME} [role="alert"]`).textContent).toContain(labels.loadAttentionFailed);

        await click(getElement<HTMLButtonElement>(`${HOME} [role="alert"] button`));
        await flushTimers();

        expect(homeText()).toContain(labels.attentionEmpty('all_done'));
    });

    it('recharge ce qui demande attention apres une tache terminee plus bas', async () => {
        const listAttention = vi.fn<AttentionApi['listAttention']>(async () => anAttention({ workload: 'open' }));
        const item = anItem({ projectId: FIRST.id, name: 'Water the plants' });
        const items = createApi({
            listItems: async () => itemPage([item]),
            moveItem: async () => ({ ...item, status: 'done', version: 2 }),
        });
        await renderApp({ listAttention }, items);
        const callsBefore = listAttention.mock.calls.length;

        await click(getElement<HTMLButtonElement>(`[data-move-item-id="${item.id}"]`));
        await click(getElement<HTMLButtonElement>('.move-item-form button[type="submit"]'));
        await flushTimers();

        expect(listAttention.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it('ne presente aucune violation axe avec des groupes remplis', async () => {
        const attention = anAttention({ workload: 'open', highPriority: { items: [anAttentionItem({ priority: 'high' })], hasMore: false } });
        await renderApp({ listAttention: async () => attention });

        const results = await axe.run(getElement(HOME), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });
});
