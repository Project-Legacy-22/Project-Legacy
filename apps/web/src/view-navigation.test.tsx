import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { App } from './app';
import type { AttentionApi } from './api/attention-api';
import type { ProjectsApi } from './api/projects-api';
import { VIEWS } from './hooks/use-view';
import type { View } from './hooks/use-view';
import { labels } from './labels';
import {
    createApi,
    createAttentionApi,
    createAuth,
    createMembersApi,
    createProjectsApi,
    openView,
    startAt,
} from './test/app-fixture';
import { anAttention } from './test/builders/attention-builder';
import { click, createReactTestRoot, flushTimers, getElement, waitFor } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// The signed-in application in four views (#446), one at a time, each with an
// address. What the criteria of the issue ask, one test each.

const HEADINGS: Record<View, string> = {
    home: 'home-heading',
    projects: 'projects-heading',
    members: 'members-heading',
    account: 'credentials-heading',
};

let root: ReactTestRoot;

async function renderApp(overrides: { projects?: ProjectsApi; attention?: AttentionApi } = {}): Promise<void> {
    await root.render(
        <App
            api={createApi()}
            auth={createAuth()}
            projects={overrides.projects ?? createProjectsApi()}
            attention={overrides.attention ?? createAttentionApi()}
            members={createMembersApi()}
        />,
    );
    await flushTimers();
}

function mainSections(): (string | null)[] {
    return [...document.querySelectorAll('main > section')].map(section => section.getAttribute('aria-labelledby'));
}

function currentLink(): string | null {
    return getElement('.view-nav [aria-current="page"]').textContent;
}

beforeEach(() => {
    document.documentElement.lang = 'en';
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
});

describe('navigation between the signed-in views', () => {
    it('opens on home, without moving focus, and names it in the tab title', async () => {
        await renderApp();

        expect(mainSections()).toEqual([HEADINGS.home]);
        expect(currentLink()).toBe(labels.viewName('home'));
        expect(document.activeElement).toBe(document.body);
        expect(document.title).toBe(labels.viewTitle('home'));
    });

    it.each(VIEWS)('opens %s from its link, alone, focused on its heading', async view => {
        await renderApp();

        await openView(view);

        expect(mainSections()[0]).toBe(HEADINGS[view]);
        expect(currentLink()).toBe(labels.viewName(view));
        expect(document.activeElement?.id).toBe(HEADINGS[view]);
        expect(document.title).toBe(labels.viewTitle(view));
        // Home is also the address with no view at all: returning to it from
        // home adds no history entry.
        expect(new URLSearchParams(window.location.search).get('view') ?? 'home').toBe(view);
    });

    it('keeps the view of the address across a reload', async () => {
        startAt('account');

        await renderApp();

        expect(mainSections()[0]).toBe(HEADINGS.account);
        expect(currentLink()).toBe(labels.viewName('account'));
        expect(document.activeElement).toBe(document.body);
    });

    it('opens home for an address that names no view', async () => {
        window.history.replaceState(null, '', '?view=nowhere');

        await renderApp();

        expect(mainSections()).toEqual([HEADINGS.home]);
    });

    it('follows the browser back to the previous view', async () => {
        await renderApp();
        await openView('projects');
        await openView('account');

        window.history.back();
        // jsdom fires popstate two timer turns later, as a browser would on
        // its own schedule.
        await waitFor(() => mainSections()[0] === HEADINGS.projects);

        expect(mainSections()[0]).toBe(HEADINGS.projects);
        expect(document.activeElement?.id).toBe(HEADINGS.projects);
    });
});

describe('what a view offers when it has nothing to show yet', () => {
    it('sends the members view to the projects when none is selected', async () => {
        await renderApp({ projects: createProjectsApi({ listProjects: async () => ({ projects: [], nextCursor: null }) }) });
        await openView('members');

        expect(getElement('main').textContent).toContain(labels.membersNoProject);
        await click(getElement<HTMLButtonElement>('main .empty-message button'));
        await flushTimers();

        expect(currentLink()).toBe(labels.viewName('projects'));
        expect(document.activeElement?.id).toBe(HEADINGS.projects);
    });

    it('opens the task form from an empty home', async () => {
        await renderApp({ attention: createAttentionApi({ listAttention: async () => anAttention({ workload: 'none' }) }) });

        await click(getElement<HTMLButtonElement>('main .empty-message button'));
        await flushTimers();

        expect(currentLink()).toBe(labels.viewName('projects'));
        expect(document.activeElement?.id).toBe('item-name');
    });
});

describe('each view against WCAG 2.1 AA', () => {
    it.each(VIEWS)('%s', async view => {
        document.title = labels.viewTitle(view);
        startAt(view);
        await renderApp();

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule gives no reliable result under jsdom;
            // contrast.test.ts checks the palette instead.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map(violation => violation.id)).toEqual([]);
    });
});
